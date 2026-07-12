// ─────────────────────────────────────────────────────────────────────────────────
// CUT / HEAL / REROUTE coherence — driven through the RUNTIME STACK directly, NOT
// through simulate().
//
// WHY NOT simulate(): simulate() is a ONE-SHOT function — it builds the stack, runs a
// behavior to a terminal event, and returns. It deliberately exposes no hook to cut a
// hole MID-RUN (cutting is an imperative, tick-interleaved world mutation). So this one
// scenario builds the SAME stack simulate() builds internally — createContext +
// createVerletWorld + createMutableWorld + createCharacterRuntime, advanced by a manual
// step loop (the harness.ts pattern) — and asserts the mutation→collision→traversal
// coherence that simulate() RELIES ON: one cut atomically changes collision segments AND
// the traversal graph, and a heal restores both byte-identically. This is the L5
// invariant underneath every simulate() run against a damageable world.
// ─────────────────────────────────────────────────────────────────────────────────
import { test, expect } from 'bun:test'
import type { CharacterDoc, WorldDocV2 } from '@dash/schema'
import {
  createContext,
  createVerletWorld,
  createMutableWorld,
  createCharacterRuntime,
  sweptCapsuleVsSegments,
  hashState,
  panelEdges,
  DEFAULT_HEAL_MS,
  STEP_MS,
  type Capsule,
} from '@dash/engine'
import { dashSpec } from './content'

// ── the coherence fixture (mirrors packages/engine/test/holes.test.ts) ─────────────
// P: a 4-wall DAMAGEABLE panel (0,0,120,200). Q: a small panel inside P (roof at
// (90,80)). B: a panel just outside P to the right (roof at (130,80)). The hop
// Q:roofR→B:roofL crosses ONLY P's right wall (x=120) at y=80, so it is PRUNED before
// the cut; cutting P.wallR around y=80 opens it. One cut on P.wallR thus changes BOTH
// collision AND traversal coherently.
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
// sweep a capsule LEFTWARD through P's right wall (x=120) at height y. `segments` is
// the live collision world's SegmentRef[] (mw.collision().segments).
type CollisionSegments = Parameters<typeof sweptCapsuleVsSegments>[3]
const sweepThroughWallR = (segments: CollisionSegments, y: number) => sweptCapsuleVsSegments(cap(132, y), -20, 0, segments)
const edgeExists = (g: { edges: { from: string; to: string }[] }, from: string, to: string) => g.edges.some((e) => e.from === from && e.to === to)

/** Build the FULL runtime stack over `world` the way simulate() does internally, with
 *  a live character runtime ticking against the mutable world. Seed 7 (deterministic). */
function buildStack(world: WorldDocV2) {
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(world, { character: GROUND, events: ctx.events, stepMs: STEP_MS })
  const spec = dashSpec({ initialTransform: { x: 60, y: -40, rot: 0, facing: 1 } })
  const rt = createCharacterRuntime({
    rig: spec.rig,
    character: spec.character,
    world: mw,
    verlet,
    rng: ctx.rng,
    events: ctx.events,
    clips: spec.clips,
    poses: spec.poses,
    names: spec.names,
    restPose: spec.restPose,
    initialTransform: spec.initialTransform,
  })
  // one full sim tick: clock, character, verlet, then heal timers (the harness step).
  const step = () => {
    ctx.clock.advance()
    rt.tick()
    verlet.step()
    mw.stepMutations()
  }
  return { ctx, verlet, mw, rt, step }
}

test('one cut atomically changes collision + traversal; a heal restores both byte-identically', () => {
  const { mw, step } = buildStack(fixture())

  // Warm the stack a few ticks so a live runtime is genuinely running while we mutate.
  for (let i = 0; i < 10; i++) step()

  // ── BEFORE: P is a solid 4-wall box; the cross-wall hop is pruned. ────────────────
  expect(mw.holesInPanel('P')).toHaveLength(0)
  expect(mw.isEnclosed(60, 150)).toBe(true)
  expect(sweepThroughWallR(mw.collision().segments, 55)).not.toBeNull() // wall solid → hit
  expect(edgeExists(mw.traversal(), 'Q:roofR', 'B:roofL')).toBe(false) // hop pruned by P.wallR
  const preHash = hashState(mw.doc())
  const preGraph = mw.traversal()

  // ── CUT (atomic — no stepMutations between the cut and these assertions) ──────────
  const hole = mw.cut('P', { edge: 'wallR', start: 30, width: 70 }) // removes wallR y∈[30,100]

  // collision changed: the capsule now PASSES through the gap at y=55…
  expect(sweepThroughWallR(mw.collision().segments, 55)).toBeNull()
  // …but a shot beside the gap (y=150) still hits the intact wall.
  expect(sweepThroughWallR(mw.collision().segments, 150)).not.toBeNull()
  // traversal REROUTED: the pruned hop through the breach now exists.
  expect(edgeExists(mw.traversal(), 'Q:roofR', 'B:roofL')).toBe(true)
  // render + enclosure reflect the breach.
  expect(mw.holesInPanel('P')).toHaveLength(1)
  expect(mw.holesInPanel('P')[0].id).toBe(hole)
  expect(mw.isEnclosed(60, 150)).toBe(false)

  // ── HEAL by letting the timer elapse through the step loop (persistScope 'none') ──
  const healTicks = Math.ceil(DEFAULT_HEAL_MS / STEP_MS)
  for (let t = 0; t < healTicks; t++) step()

  expect(mw.holesInPanel('P')).toHaveLength(0)
  expect(mw.isEnclosed(60, 150)).toBe(true)
  expect(sweepThroughWallR(mw.collision().segments, 55)).not.toBeNull() // wall solid again
  expect(edgeExists(mw.traversal(), 'Q:roofR', 'B:roofL')).toBe(false) // hop pruned again
  // segments restored byte-identically + graph golden-equal.
  expect(hashState(mw.doc())).toBe(preHash)
  expect(mw.traversal()).toEqual(preGraph)
  // exactly one cut + one healed event were emitted on the shared bus.
  expect(mw.trace().filter((e) => e.type === 'cut')).toHaveLength(1)
  const healed = mw.trace().filter((e) => e.type === 'healed')
  expect(healed).toHaveLength(1)
  expect((healed[0].payload as { holeId: string }).holeId).toBe(hole)
})
