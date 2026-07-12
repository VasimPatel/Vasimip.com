// Phase 7a gate — PATHING (cross-surface routing via the traversal graph).
//   1. On the REAL INTRO page a moveTo to a node on another panel plans a route
//      (path:route) and executes at least one graph leg (path:leg), arriving.
//   2. A synthetic wall between two reachable spots forces the route OVER THE TOP
//      (the graph, not a straight line through the wall).
//   3. Cutting the wall REBUILDS the graph and RE-ROUTES: the same moveTo goes
//      through the breach instead of over the top. Core assertion: graph rebuild
//      changes routing.
import { test, expect } from 'bun:test'
import type { WorldDocV2, CharacterDoc } from '@dash/schema'
import {
  worldFromNotebook,
  createContext,
  createVerletWorld,
  createMutableWorld,
  createCharacterRuntime,
  panelEdges,
} from '../src/index'
import { rig, character, clips, poses, names, notebook, STEP } from './harness'

// ── 1. REAL INTRO page: a cross-panel moveTo routes multi-leg (walk + hop) ─────────
// Dash walks panel 0's roof end-to-end, then HOPS across the gutter onto panel 1 —
// the gate's "multi-leg route (walk + hop) across the real notebook INTRO page".
// moveTo routes over walk/hop/jump edges ONLY (fly edges are excluded for ground
// verbs even though Dash's caps include fly), and hop/jump edges are arc-feasibility
// pruned against the live collision world at plan time (the 6a graph computes
// reachability from caps alone, so some of its jump edges are not executable).
test('INTRO page: a cross-panel moveTo routes multi-leg (walk + hop) to arrival', () => {
  const intro = worldFromNotebook(notebook.pages)[0].world
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(intro, { character, events: ctx.events, stepMs: STEP })
  const g = mw.traversal()

  // Dash stands on panel 0's roofL; the goal is panel 1's roofL (across the gutter).
  const startN = g.nodes.find((n) => n.id === 'panel:0:0:roofL')!
  const goalN = g.nodes.find((n) => n.id === 'panel:0:1:roofL')!
  expect(startN).toBeTruthy()
  expect(goalN).toBeTruthy()

  const rt = createCharacterRuntime({
    rig, character, world: mw, verlet, rng: ctx.rng, events: ctx.events, clips, poses, names,
    restPose: poses.stand, initialTransform: { x: startN.x, y: startN.y, rot: 0, facing: 1 },
  })
  const c = rt.capsule()
  rt.transform.y += startN.y - (c.y1 + c.r) // snap feet to the roof node

  rt.runBehavior({ schemaVersion: 2, id: 'p', steps: [{ verb: 'moveTo', target: 'node:panel:0:1:roofL' }] })
  for (let i = 0; i < 6000; i++) {
    ctx.clock.advance()
    rt.tick()
    verlet.step()
    mw.stepMutations()
    if (!rt.behavior.running()) break
  }
  const tr = ctx.events.trace()
  const routes = tr.filter((e) => e.type === 'path:route')
  const legs = tr.filter((e) => e.type === 'path:leg')
  const legTypes = legs.map((e) => (e.payload as { edgeType?: string }).edgeType)
  console.log(`[pathing/intro] routes=${routes.length} legs=${JSON.stringify(legTypes)} status=${rt.locomotion.status}`)

  expect(routes.length).toBe(1)
  expect(legs.length).toBeGreaterThanOrEqual(2) // multi-leg
  expect(legTypes).toContain('walk')
  expect(legTypes).toContain('hop')
  expect(legTypes).not.toContain('fly') // ground verb never rides fly edges
  expect(rt.locomotion.status).toBe('arrived')
  // Graph nodes are SURFACE (feet) points; the transform is the hip — compare feet.
  const cEnd = rt.capsule()
  const feetY = cEnd.y1 + cEnd.r
  expect(Math.hypot(rt.transform.x - goalN.x, feetY - goalN.y)).toBeLessThan(12)
})

// ── 1b. Ground-unreachable target: honest blocked, never a fantasy fly/jump ───────
// Panel 2 is tucked UNDER panel 0's overhang: the 6a graph offers jump edges to it,
// but no ballistic arc can get there (arc pruning removes them all) — so the moveTo
// falls back to the direct ground leg and BLOCKS. It must never silently ride a fly
// edge or execute an inexecutable jump.
test('INTRO page: a ground-unreachable target blocks instead of riding fantasy edges', () => {
  const intro = worldFromNotebook(notebook.pages)[0].world
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(intro, { character, events: ctx.events, stepMs: STEP })
  const g = mw.traversal()
  const startN = g.nodes.find((n) => n.id === 'panel:0:0:roofR')!

  const rt = createCharacterRuntime({
    rig, character, world: mw, verlet, rng: ctx.rng, events: ctx.events, clips, poses, names,
    restPose: poses.stand, initialTransform: { x: startN.x, y: startN.y, rot: 0, facing: 1 },
  })
  const c = rt.capsule()
  rt.transform.y += startN.y - (c.y1 + c.r)

  rt.runBehavior({ schemaVersion: 2, id: 'p', steps: [{ verb: 'moveTo', target: 'node:panel:0:2:roofL' }] })
  for (let i = 0; i < 6000; i++) {
    ctx.clock.advance()
    rt.tick()
    verlet.step()
    mw.stepMutations()
    if (!rt.behavior.running()) break
  }
  const tr = ctx.events.trace()
  expect(tr.filter((e) => e.type === 'intent:blocked').length).toBe(1)
  expect(rt.locomotion.status).toBe('blocked')
  expect(rt.behavior.status).toBe('halted')
})

// ── synthetic reroute fixture ──────────────────────────────────────────────────────
// P is a tall 4-wall DAMAGEABLE panel. Q sits DEEP INSIDE P (its roof 180px below
// P's roof — no ballistic arc can enter over the top: the rise exceeds the jump
// caps, and the walls stop everything else). B sits just OUTSIDE P to the right at
// Q's level. Sealed, the target is honestly UNREACHABLE (blocked at the wall);
// cutting a tall breach in P.wallR at arc height opens a ballistic hop through it.
// Geometry note: the hole (y 60..160 on x=160) is sized so the capsule (~50px
// tall) clears both remaining wall stubs at the arc's crossing height — the strict
// air rules treat ANY airborne contact as blocking, so the breach must genuinely
// fit the character.
const GROUND: CharacterDoc = {
  id: 'ground',
  rig: 'dash',
  personality: { energy: 0.5, bounciness: 0.5, confidence: 0.5, sloppiness: 0.5 },
  locomotion: { modes: ['walk', 'hop'], maxJumpDistance: 200, maxJumpHeight: 120 },
}

const FX = {
  P: { x: 0, y: 0, w: 160, h: 300 },
  Q: { x: 100, y: 180, w: 24, h: 20 },
  B: { x: 170, y: 180, w: 60, h: 20 },
  hole: { edge: 'wallR' as const, start: 30, width: 175 }, // y 30..205 on x=160 —
  // covers BOTH the graph's straight-line test at the roof level (y=180) and the
  // ballistic arc's crossing band (the ~82px-tall capsule at apex spans y ~61..147)
  level: 180, // the Q/B roof line
}

function fixture(): WorldDocV2 {
  const { P, Q, B } = FX
  const mk = (id: string, box: { x: number; y: number; w: number; h: number }, damageable = false) => ({
    id,
    components: {
      transform: { x: box.x, y: box.y },
      surface: { box, anchor: { dx: box.w / 2, dy: 0 } },
      collidable: { shape: 'segments' as const, segments: panelEdges(box) },
      ...(damageable ? { damageable: {} } : {}),
    },
  })
  return { schemaVersion: 2, seed: 1, entities: [mk('P', P, true), mk('Q', Q), mk('B', B)] }
}

/** Run a GROUND moveTo from B:roofL to Q:roofR, optionally after cutting P.wallR.
 * Returns the planned route legs + status. */
function routeBtoQ(cut: boolean) {
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(fixture(), { character: GROUND, events: ctx.events, stepMs: STEP })
  if (cut) mw.cut('P', FX.hole, { persistScope: 'session' })
  const edges = mw.traversal().edges.length
  const rt = createCharacterRuntime({
    rig, character: GROUND, world: mw, verlet, rng: ctx.rng, events: ctx.events, clips, poses, names,
    restPose: poses.stand, initialTransform: { x: FX.B.x + 10, y: FX.level, rot: 0, facing: 1 },
  })
  const c = rt.capsule()
  rt.transform.y += FX.level - (c.y1 + c.r)
  rt.runBehavior({ schemaVersion: 2, id: 'p', steps: [{ verb: 'moveTo', target: 'node:Q:roofR' }] })
  for (let i = 0; i < 3000; i++) {
    ctx.clock.advance()
    rt.tick()
    verlet.step()
    mw.stepMutations()
    if (!rt.behavior.running()) break
  }
  const route = ctx.events.trace().find((e) => e.type === 'path:route')
  const legEdgeTypes = (route?.payload as { legs: { edgeType?: string }[] } | undefined)?.legs.map((l) => l.edgeType) ?? []
  return { legEdgeTypes, edges, status: rt.locomotion.status, arrived: ctx.events.trace().some((e) => e.type === 'intent:arrived') }
}

test('a sealed wall leaves the target unreachable: honest blocked, no fantasy route', () => {
  const before = routeBtoQ(false)
  // Q sits INSIDE sealed panel P. The 6a graph offers jump edges over/into P, but no
  // ballistic arc can enter a closed panel (arc pruning removes them all) — the only
  // honest outcome is walking into the wall and blocking. This is the same physics
  // that makes the Wall Test's enclosed case deterministic, seen from outside.
  console.log(`[pathing/sealed] legs=${JSON.stringify(before.legEdgeTypes)} status=${before.status}`)
  expect(before.arrived).toBe(false)
  expect(before.status).toBe('blocked')
})

test('cutting the wall rebuilds the graph and opens a hop through the breach', () => {
  const before = routeBtoQ(false)
  const after = routeBtoQ(true)

  // 1. graph rebuilt: the cut adds edges through the breach.
  expect(after.edges).toBeGreaterThan(before.edges)

  // 2. reachability CHANGED: blocked (sealed) → hop legs through the gap, arriving.
  console.log(`[pathing/reroute] before status=${before.status} after legs=${JSON.stringify(after.legEdgeTypes)} status=${after.status}`)
  expect(before.arrived).toBe(false)
  expect(after.legEdgeTypes.length).toBeGreaterThanOrEqual(1)
  expect(after.legEdgeTypes.every((t) => t === 'hop')).toBe(true)
  expect(after.arrived).toBe(true)
})
