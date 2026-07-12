import { test, expect } from 'bun:test'
import {
  createMutableWorld,
  panelEdges,
  sweptCapsuleVsSegments,
  sweptPointVsSegments,
  hashState,
  DEFAULT_HEAL_MS,
  HOLE_EDGE_TRIM,
  STEP_MS,
  type Capsule,
} from '../src/index'
import type { CharacterDoc, Segment, WorldDocV2 } from '@dash/schema'

const TRIM = HOLE_EDGE_TRIM

// ── the four-representation fixture ───────────────────────────────────────────────
// P: a 4-wall damageable panel (0,0,120,200). Q: a small panel INSIDE P (roofR at
// (110,80)). B: a panel just OUTSIDE P to the right (roofL at (130,80)). The hop
// Q:roofR→B:roofL crosses ONLY P's right wall (x=120) at y=80, so it is PRUNED
// before the cut; cutting P.wallR around y=80 opens it. One cut on P.wallR thus
// changes ALL FOUR representations coherently.
const GROUND: CharacterDoc = {
  id: 'ground',
  rig: 'dash',
  personality: { energy: 0.5, bounciness: 0.5, confidence: 0.5, sloppiness: 0.5 },
  locomotion: { modes: ['walk', 'hop'], maxJumpDistance: 200, maxJumpHeight: 120 },
}

function fixture(): WorldDocV2 {
  const P = { x: 0, y: 0, w: 120, h: 200 }
  const Q = { x: 90, y: 80, w: 20, h: 20 }
  const B = { x: 130, y: 80, w: 40, h: 20 }
  const mk = (id: string, box: { x: number; y: number; w: number; h: number }, damageable = false) => ({
    id,
    components: {
      surface: { box, anchor: { dx: box.w / 2, dy: 0 } },
      collidable: { shape: 'segments' as const, segments: panelEdges(box) },
      ...(damageable ? { damageable: {} } : {}),
    },
  })
  return { schemaVersion: 2, seed: 1, entities: [mk('P', P, true), mk('Q', Q), mk('B', B)] }
}

const R = 8
const cap = (cx: number, cy: number): Capsule => ({ x0: cx, y0: cy - 4, x1: cx, y1: cy + 4, r: R })
// sweep a capsule LEFTWARD through P's right wall (x=120). Probe ys avoid B (y∈[80,100]).
const sweepThroughWallR = (cw: { segments: any }, y: number) => sweptCapsuleVsSegments(cap(132, y), -20, 0, cw.segments)

function edgeExists(g: { edges: { from: string; to: string }[] }, from: string, to: string): boolean {
  return g.edges.some((e) => e.from === from && e.to === to)
}

test('HEADLINE GATE: one cut changes collision + traversal + holes + isEnclosed coherently & atomically', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })

  // ── BEFORE ────────────────────────────────────────────────────────────────────
  expect(mw.holesInPanel('P')).toHaveLength(0)
  expect(mw.isEnclosed(60, 150)).toBe(true) // P is a solid 4-wall box
  expect(sweepThroughWallR(mw.collision(), 55)).not.toBeNull() // wall solid at y=55 → hit
  expect(edgeExists(mw.traversal(), 'Q:roofR', 'B:roofL')).toBe(false) // hop pruned by P.wallR
  const preHash = hashState(mw.doc())
  const preGraph = mw.traversal()

  // ── CUT (atomic: no stepMutations between cut and the four assertions) ──────────
  const hole = mw.cut('P', { edge: 'wallR', start: 30, width: 70 }) // removes wallR y∈[30,100]

  // 1. collision segments changed — capsule now PASSES through the gap at y=55…
  expect(sweepThroughWallR(mw.collision(), 55)).toBeNull()
  // …but a grazing shot beside the gap (y=150) still hits the intact wall.
  expect(sweepThroughWallR(mw.collision(), 150)).not.toBeNull()
  // 2. traversal graph changed — the pruned hop through the breach now exists.
  expect(edgeExists(mw.traversal(), 'Q:roofR', 'B:roofL')).toBe(true)
  // 3. holesInPanel returns the hole (render data for the torn mask).
  const holes = mw.holesInPanel('P')
  expect(holes).toHaveLength(1)
  expect(holes[0].id).toBe(hole)
  expect(holes[0].edge).toBe('wallR')
  expect(holes[0]).toMatchObject({ x1: 120, y1: 30, x2: 120, y2: 100 }) // render extent
  // 4. isEnclosed flips false for the breached panel.
  expect(mw.isEnclosed(60, 150)).toBe(false)
  expect(mw.collision().panels.find((p) => p.entity === 'P')!.fullyWalled).toBe(false)

  // ── HEAL (default policy: persistScope 'none') restores all four EXACTLY ─────────
  const expectTicks = Math.ceil(DEFAULT_HEAL_MS / STEP_MS)
  for (let t = 0; t < expectTicks; t++) mw.stepMutations()

  expect(mw.holesInPanel('P')).toHaveLength(0)
  expect(mw.isEnclosed(60, 150)).toBe(true)
  expect(sweepThroughWallR(mw.collision(), 55)).not.toBeNull() // wall solid again
  expect(edgeExists(mw.traversal(), 'Q:roofR', 'B:roofL')).toBe(false) // hop pruned again
  expect(mw.collision().panels.find((p) => p.entity === 'P')!.fullyWalled).toBe(true)
  // segments byte-equal (doc hashes identically) + graph golden-equal
  expect(hashState(mw.doc())).toBe(preHash)
  expect(mw.traversal()).toEqual(preGraph)
  // healed event emitted
  const healed = mw.trace().filter((e) => e.type === 'healed')
  expect(healed).toHaveLength(1)
  expect((healed[0].payload as any).holeId).toBe(hole)
})

test('cut emits a `cut` event with the render extent', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  mw.cut('P', { edge: 'roof', start: 40, width: 30 })
  const cuts = mw.trace().filter((e) => e.type === 'cut')
  expect(cuts).toHaveLength(1)
  expect(cuts[0].payload).toMatchObject({ panel: 'P', edge: 'roof', start: 40, width: 30, x1: 40, y1: 0, x2: 70, y2: 0 })
})

/** Live segments of an entity, filtered to the horizontal y=0 line (P's roof). */
function roofLineSegs(mw: { doc(): WorldDocV2 }, id: string): Segment[] {
  const coll = mw.doc().entities.find((e) => e.id === id)!.components.collidable as { segments: Segment[] }
  return coll.segments.filter((s) => s.y1 === 0 && s.y2 === 0)
}

test('overlapping cuts on one edge: correct after EACH heal (one of two, then both → byte-identity)', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  const pre = hashState(mw.doc())
  const h1 = mw.cut('P', { edge: 'roof', start: 20, width: 40 }, { persistScope: 'session' }) // [20,60]
  const h2 = mw.cut('P', { edge: 'roof', start: 50, width: 40 }, { persistScope: 'session' }) // [50,90] overlaps
  // roof (0..120) minus union [20,90] → [0, 20−trim] and [90+trim, 120]
  // (hole-created boundaries are trimmed; original endpoints 0/120 are not).
  expect(roofLineSegs(mw, 'P')).toEqual([
    { x1: 0, y1: 0, x2: 20 - TRIM, y2: 0 },
    { x1: 90 + TRIM, y1: 0, x2: 120, y2: 0 },
  ])
  // ── heal ONE of the two overlapping holes: exactly the other's geometry remains ──
  mw.heal(h1)
  expect(roofLineSegs(mw, 'P')).toEqual([
    { x1: 0, y1: 0, x2: 50 - TRIM, y2: 0 },
    { x1: 90 + TRIM, y1: 0, x2: 120, y2: 0 },
  ])
  mw.heal(h2)
  expect(hashState(mw.doc())).toBe(pre) // both healed → original roof restored exactly
})

// ── BLOCKER 2 regression: coincident named edges (floorIn === roof at anchor.dy=0) ──
// The fixture's panels all have anchor.dy = 0 — the COMMON real-notebook case — so
// 'floorIn' and 'roof' name the SAME line. Holes cut under EITHER name must subtract
// from that line together, and healing one must leave exactly the other's geometry.
test('coincident edges: roof + floorIn holes (anchor.dy=0) subtract together; healing one leaves the other', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  const pre = hashState(mw.doc())
  const hRoof = mw.cut('P', { edge: 'roof', start: 20, width: 20 }, { persistScope: 'session' }) // [20,40]
  const hFloor = mw.cut('P', { edge: 'floorIn', start: 30, width: 20 }, { persistScope: 'session' }) // [30,50] SAME line
  // BOTH names' holes removed: roof minus union [20,50].
  expect(roofLineSegs(mw, 'P')).toEqual([
    { x1: 0, y1: 0, x2: 20 - TRIM, y2: 0 },
    { x1: 50 + TRIM, y1: 0, x2: 120, y2: 0 },
  ])
  // Heal the ROOF-named hole → exactly the floorIn-named hole's span stays removed.
  mw.heal(hRoof)
  expect(roofLineSegs(mw, 'P')).toEqual([
    { x1: 0, y1: 0, x2: 30 - TRIM, y2: 0 },
    { x1: 50 + TRIM, y1: 0, x2: 120, y2: 0 },
  ])
  mw.heal(hFloor)
  expect(hashState(mw.doc())).toBe(pre)
})

test("persistScope: 'none' heals, 'session' survives past the heal horizon", () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  mw.cut('P', { edge: 'wallL', start: 40, width: 20 }, { persistScope: 'none', healAfterMs: 100 })
  mw.cut('P', { edge: 'wallR', start: 40, width: 20 }, { persistScope: 'session' })
  const horizon = Math.ceil(1000 / STEP_MS) // 1 s — well past the 100 ms 'none' heal
  for (let t = 0; t < horizon; t++) mw.stepMutations()
  const holes = mw.holesInPanel('P')
  expect(holes).toHaveLength(1) // the 'none' one healed; the 'session' one survives
  expect(holes[0].edge).toBe('wallR')
})

test("persistScope: 'saved' validates in schema but is REJECTED at runtime", () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  expect(() => mw.cut('P', { edge: 'roof', start: 10, width: 10 }, { persistScope: 'saved' })).toThrow(/saved/)
})

test('damageable default heal policy (schema fields) is honored', () => {
  const doc = fixture()
  // author a per-panel default: heal fast, session-less
  ;(doc.entities.find((e) => e.id === 'P')!.components as any).damageable = { healAfterMs: 50 }
  const mw = createMutableWorld(doc, { character: GROUND })
  mw.cut('P', { edge: 'roof', start: 10, width: 10 }) // no opts → uses panel default 50ms
  const n = Math.ceil(50 / STEP_MS)
  for (let t = 0; t < n; t++) mw.stepMutations()
  expect(mw.holesInPanel('P')).toHaveLength(0)
})

test('cut on a non-cuttable entity throws', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  expect(() => mw.cut('nope', { edge: 'roof', start: 0, width: 10 })).toThrow(/not a cuttable panel/)
})

// ── BLOCKER 1 regressions: a rejected cut leaves NO hole, NO segment change, NO event ──

/** Assert a throwing cut left the world fully untouched. */
function expectRejected(mw: ReturnType<typeof createMutableWorld>, panel: string, fn: () => void, msg: RegExp): void {
  const pre = hashState(mw.doc())
  expect(fn).toThrow(msg)
  expect(mw.holesInPanel(panel)).toHaveLength(0)
  expect(hashState(mw.doc())).toBe(pre) // segments unchanged
  expect(mw.trace().filter((e) => e.type === 'cut')).toHaveLength(0) // no event
}

test('BLOCKER 1: floorIn cut on a standard panel (anchor.dy≠0, no interior segment) is REJECTED', () => {
  // X's floorIn line sits at y=box.y+50 — a standard panelEdges() panel has NO
  // collidable segment there. A "cut" would change render+events but not
  // collision/traversal: the exact three-representation desync the gate forbids.
  const box = { x: 0, y: 0, w: 100, h: 100 }
  const doc: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [{ id: 'X', components: { surface: { box, anchor: { dx: 50, dy: 50 } }, collidable: { shape: 'segments', segments: panelEdges(box) }, damageable: {} } }],
  }
  const mw = createMutableWorld(doc, { character: GROUND })
  expectRejected(mw, 'X', () => mw.cut('X', { edge: 'floorIn', start: 10, width: 20 }), /no collidable segment lies on the floorIn edge/)
})

test('BLOCKER 1: cut on a panel WITHOUT a damageable component is REJECTED', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  expectRejected(mw, 'Q', () => mw.cut('Q', { edge: 'roof', start: 2, width: 5 }), /no 'damageable' component/)
})

test('coverage is measured against ORIGINAL segments: a cut nested inside an existing gap is a legal overlapping hole', () => {
  // Deliberate semantic (matches the reviewer's "positive ORIGINAL coverage"):
  // holes are subtractive sets over the ORIGINALS, so a cut inside an existing gap
  // is the degenerate overlapping cut — coherent because healing the outer hole
  // must leave the nested hole's span still removed. (Rejecting on LIVE coverage
  // would forbid ordinary overlapping cuts, which the overlap test exercises.)
  const mw = createMutableWorld(fixture(), { character: GROUND })
  const outer = mw.cut('P', { edge: 'roof', start: 20, width: 40 }, { persistScope: 'session' }) // [20,60]
  const nested = mw.cut('P', { edge: 'roof', start: 30, width: 10 }, { persistScope: 'session' }) // [30,40] ⊂ [20,60]
  expect(mw.holesInPanel('P')).toHaveLength(2)
  mw.heal(outer) // outer heals → EXACTLY the nested span stays removed
  expect(roofLineSegs(mw, 'P')).toEqual([
    { x1: 0, y1: 0, x2: 30 - TRIM, y2: 0 },
    { x1: 40 + TRIM, y1: 0, x2: 120, y2: 0 },
  ])
  mw.heal(nested)
})

// ── BLOCKER 3 regressions: the hole is the INTERSECTION of request × edge ──────────

test('BLOCKER 3: partially out-of-range request clamps to the INTERSECTION, never grows', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  const id = mw.cut('P', { edge: 'roof', start: -10, width: 20 }) // request [-10,10] → [0,10]
  const h = mw.holesInPanel('P').find((x) => x.id === id)!
  expect(h.start).toBe(0)
  expect(h.width).toBe(10) // NOT 20 — the request must not slide/grow to [0,20]
  expect(h).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 0 })
})

test('BLOCKER 3: wholly out-of-range, zero-width, negative-width, and non-finite cuts are all REJECTED', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: 500, width: 20 }), /does not intersect/)
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: -50, width: 20 }), /does not intersect/) // [-50,-30]
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: 10, width: 0 }), /width must be > 0/)
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: 10, width: -5 }), /width must be > 0/)
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: NaN, width: 10 }), /finite/)
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: 10, width: Infinity }), /finite/)
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'bogus' as any, start: 10, width: 10 }), /unknown edge/)
})

// ── SHOULD-FIX 4 regression: hole-boundary residuals are epsilon-trimmed ────────────

test('boundary shots: a radius-0 point at the EXACT hole boundary passes; just beside it hits', () => {
  const box = { x: 0, y: 0, w: 120, h: 200 }
  const doc: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [{ id: 'P', components: { surface: { box, anchor: { dx: 60, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(box) }, damageable: {} } }],
  }
  const mw = createMutableWorld(doc, { character: GROUND })
  mw.cut('P', { edge: 'wallR', start: 30, width: 70 }, { persistScope: 'session' }) // wallR y∈[30,100] gone
  const shoot = (y: number) => sweptPointVsSegments(130, y, 0, -20, 0, mw.collision().segments)
  expect(shoot(30)).toBeNull() // EXACT upper boundary → through the gap (trimmed residual)
  expect(shoot(100)).toBeNull() // EXACT lower boundary → through
  expect(shoot(30 - 2 * TRIM)).not.toBeNull() // just beside the gap → hits the residual
  expect(shoot(100 + 2 * TRIM)).not.toBeNull()
})

// ── SHOULD-FIX 5 regression: doc() is an isolated snapshot ─────────────────────────

test('doc() returns a snapshot — mutating it cannot desync the engine', () => {
  const mw = createMutableWorld(fixture(), { character: GROUND })
  const before = mw.collision().segments.length
  const d = mw.doc()
  ;(d.entities[0].components.collidable as { segments: Segment[] }).segments.length = 0 // vandalize the snapshot
  expect(mw.collision().segments.length).toBe(before) // engine unaffected
  expect((mw.doc().entities[0].components.collidable as { segments: Segment[] }).segments.length).toBeGreaterThan(0) // fresh snapshot intact
})

// ── ITEM 8 runtime-validation regressions ──────────────────────────────────────────

test('runtime validation: stepMs must be > 0 and finite; healAfterMs must be >= 0 and finite', () => {
  expect(() => createMutableWorld(fixture(), { stepMs: 0 })).toThrow(/stepMs/)
  expect(() => createMutableWorld(fixture(), { stepMs: -8 })).toThrow(/stepMs/)
  expect(() => createMutableWorld(fixture(), { stepMs: NaN })).toThrow(/stepMs/)
  const mw = createMutableWorld(fixture(), { character: GROUND })
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: 10, width: 10 }, { healAfterMs: -5 }), /healAfterMs/)
  expectRejected(mw, 'P', () => mw.cut('P', { edge: 'roof', start: 10, width: 10 }, { healAfterMs: NaN }), /healAfterMs/)
})
