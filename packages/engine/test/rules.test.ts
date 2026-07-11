import { test, expect } from 'bun:test'
import {
  createMutableWorld,
  createRuleTable,
  createProjectileSim,
  createVerletWorld,
  dispatch,
  nearestEdgeInterval,
  panelEdges,
  DEFAULT_RULES,
  type RuleEventCtx,
} from '../src/index'
import type { RuleRow, WorldDocV2 } from '@dash/schema'

// A single damageable vertical wall D (x∈[200,220], y∈[0,300]) for projectile tests,
// plus a plain surface panel S and a disturbable prop entity for the other rows.
function world(): WorldDocV2 {
  const D = { x: 200, y: 0, w: 20, h: 300 }
  const S = { x: 0, y: 400, w: 100, h: 40 }
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      { id: 'D', components: { surface: { box: D, anchor: { dx: 10, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(D) }, damageable: {} } },
      { id: 'S', components: { surface: { box: S, anchor: { dx: 50, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(S) } } },
      { id: 'prop1', components: { transform: { x: 300, y: 300 }, disturbable: { mass: 1 } } },
    ],
  }
}

// ── ROW 1: projectile × damageable → cut (end-to-end via the projectile stepper) ──
test('ROW projectile×damageable→cut: fired laser hits → hit event → cut → hole exists', () => {
  const mw = createMutableWorld(world())
  const table = createRuleTable() // DEFAULT_RULES
  const sim = createProjectileSim(mw, table)
  sim.fire({ x: 0, y: 150, vx: 4000, vy: 0 }) // straight at D's left wall (x=200)
  for (let t = 0; t < 30 && sim.active().length > 0; t++) sim.step()

  const types = mw.trace().map((e) => e.type)
  expect(types).toContain('hit')
  expect(types).toContain('cut')
  expect(types.indexOf('hit')).toBeLessThan(types.indexOf('cut')) // hit BEFORE cut
  const holes = mw.holesInPanel('D')
  expect(holes).toHaveLength(1)
  expect(holes[0].edge).toBe('wallL') // impact mapped to the nearest edge (left wall)
})

// ── ROW 2: character × wall → blocked (event fires exactly once per dispatch) ─────
test('ROW character×wall→blocked: emits `blocked` exactly once', () => {
  const mw = createMutableWorld(world())
  const table = createRuleTable()
  const ctx: RuleEventCtx = {
    event: 'blocked',
    a: { entity: 'dash', kind: 'locomotion' },
    b: { entity: 'D', kind: 'surface' },
    point: { x: 200, y: 150 },
    normal: { x: -1, y: 0 },
  }
  const res = dispatch(ctx, table, mw)
  expect(res.matchedRows).toBe(1)
  expect(mw.trace().filter((e) => e.type === 'blocked')).toHaveLength(1)
})

// ── ROW 3: character × disturbable → impulse (assert DIRECTION — P5 +y DOWN) ──────
test('ROW character×disturbable→impulse: prop gets a DOWNWARD impulse and moves +y', () => {
  const mw = createMutableWorld(world())
  const table = createRuleTable()
  const vw = createVerletWorld()
  vw.addProp('prop1', { x: 300, y: 300, w: 40, h: 10, stiffnessClass: 'stiff' })
  const pid = vw.bodyHandle('prop1')!.particleIds[0]
  const y0 = vw.particleY(pid)

  const ctx: RuleEventCtx = {
    event: 'contact',
    a: { entity: 'dash', kind: 'locomotion' },
    b: { entity: 'prop1', kind: 'disturbable' },
    vel: { x: 0, y: 240 }, // character stepping DOWN onto the prop
  }
  const res = dispatch(ctx, table, mw, vw)
  const imp = res.actions.find((a) => a.kind === 'impulse') as any
  expect(imp.applied).toBe(true)
  expect(imp.vy).toBeGreaterThan(0) // downward (P5 +y DOWN)
  vw.step()
  expect(vw.particleY(pid)).toBeGreaterThan(y0) // prop actually moved DOWN
})

// ── ROW 4: character × surface → support (stand/rest resolution surfaced) ─────────
test('ROW character×surface→support: emits `support` for the mover', () => {
  const mw = createMutableWorld(world())
  const table = createRuleTable()
  const ctx: RuleEventCtx = {
    event: 'landed',
    a: { entity: 'dash', kind: 'locomotion' },
    b: { entity: 'S', kind: 'surface' },
    point: { x: 50, y: 400 },
    normal: { x: 0, y: -1 },
  }
  const res = dispatch(ctx, table, mw)
  const sup = res.actions.find((a) => a.kind === 'support') as any
  expect(sup.entity).toBe('dash')
  const ev = mw.trace().find((e) => e.type === 'support')
  expect(ev).toBeDefined()
  expect((ev!.payload as any).entity).toBe('dash')
})

// ── DATA-DRIVEN PROOF: swap a row's response, observe changed behavior ────────────
test('rows are DATA: swapping the projectile→cut response to emitEvent changes behavior', () => {
  const swapped: RuleRow[] = DEFAULT_RULES.map((r) =>
    r.a === 'projectile' && r.b === 'damageable' ? { ...r, responses: [{ kind: 'emitEvent', event: 'boom' }] } : r,
  )
  const mw = createMutableWorld(world())
  const table = createRuleTable(swapped)
  const sim = createProjectileSim(mw, table)
  sim.fire({ x: 0, y: 150, vx: 4000, vy: 0 })
  for (let t = 0; t < 30 && sim.active().length > 0; t++) sim.step()

  const types = mw.trace().map((e) => e.type)
  expect(types).toContain('hit')
  expect(types).toContain('boom') // the swapped response fired…
  expect(types).not.toContain('cut') // …and NO cut happened
  expect(mw.holesInPanel('D')).toHaveLength(0)
})

// ── unit: impact → nearest edge interval mapping ──────────────────────────────────
test('nearestEdgeInterval maps an impact point to the nearest box edge, centered', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 }
  expect(nearestEdgeInterval(box, 50, 2, 20)).toMatchObject({ edge: 'roof', start: 40, width: 20 }) // near top
  expect(nearestEdgeInterval(box, 98, 50, 20)).toMatchObject({ edge: 'wallR', start: 40, width: 20 }) // near right
})

// ── SHOULD-FIX 6 regression: an explicit response `edge` REPROJECTS the impact ─────
test('explicit cut.edge: impact is projected onto THAT edge, not nearest-then-renamed', () => {
  // Impact (210, 2) is NEAREST the roof (dist 2). With width 10 the roof-projected
  // start would be 10−5 = 5; the buggy rename kept that 5 on wallR. Correct
  // projection onto wallR uses t = y = 2 → start = clamp(2−5, 0, 290) = 0.
  const mw = createMutableWorld(world())
  const rows: RuleRow[] = [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', edge: 'wallR', width: 10 }] }]
  const ctx: RuleEventCtx = {
    event: 'hit',
    a: { entity: 'p1', kind: 'projectile' },
    b: { entity: 'D', kind: 'damageable' },
    point: { x: 210, y: 2 },
  }
  const res = dispatch(ctx, createRuleTable(rows), mw)
  expect(res.actions.filter((a) => a.kind === 'cut')).toHaveLength(1)
  const h = mw.holesInPanel('D')[0]
  expect(h.edge).toBe('wallR')
  expect(h.start).toBe(0) // projected onto wallR (t=2, centered, clamped) — NOT the roof's 5
  expect(h.width).toBe(10)
  // world extent confirms it's really on the right wall (x=220), spanning y∈[0,10]
  expect(h).toMatchObject({ x1: 220, y1: 0, x2: 220, y2: 10 })
})

test('a rule-driven cut the world must reject emits `cutRejected` (no crash, no hole)', () => {
  // D's floorIn line (anchor.dy=0) coincides with its roof, so use a panel whose
  // floorIn has no collidable coverage: anchor.dy = 150 (interior line, no segment).
  const box = { x: 200, y: 0, w: 20, h: 300 }
  const doc: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [{ id: 'D', components: { surface: { box, anchor: { dx: 10, dy: 150 } }, collidable: { shape: 'segments', segments: panelEdges(box) }, damageable: {} } }],
  }
  const mw = createMutableWorld(doc)
  const rows: RuleRow[] = [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', edge: 'floorIn' }] }]
  const ctx: RuleEventCtx = { event: 'hit', a: { entity: 'p1', kind: 'projectile' }, b: { entity: 'D', kind: 'damageable' }, point: { x: 200, y: 150 } }
  const res = dispatch(ctx, createRuleTable(rows), mw) // must NOT throw
  expect(res.actions.filter((a) => a.kind === 'cut')).toHaveLength(0)
  expect(mw.holesInPanel('D')).toHaveLength(0)
  const rejected = mw.trace().filter((e) => e.type === 'cutRejected')
  expect(rejected).toHaveLength(1)
  expect((rejected[0].payload as any).reason).toMatch(/no collidable segment/)
})

// ── SHOULD-FIX 7 regression: projectile snapshot carries nextId ────────────────────
test('projectile getState/setState round-trips nextId — a restored sim never re-issues an id', () => {
  const mw = createMutableWorld(world())
  const table = createRuleTable()
  const sim = createProjectileSim(mw, table)
  const id1 = sim.fire({ x: 0, y: 150, vx: 10, vy: 0 }) // 'proj:1', slow → stays in flight
  const snap = JSON.parse(JSON.stringify(sim.getState())) // plain-JSON round-trip
  expect(snap.nextId).toBe(2)

  const sim2 = createProjectileSim(createMutableWorld(world()), table)
  sim2.setState(snap)
  const id2 = sim2.fire({ x: 0, y: 160, vx: 10, vy: 0 })
  expect(id2).not.toBe(id1) // without nextId in state this would collide as 'proj:1'
  expect(new Set(sim2.active().map((p) => p.id)).size).toBe(2) // both distinct + live
})
