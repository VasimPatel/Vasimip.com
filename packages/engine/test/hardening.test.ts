// Phase 7a HARDENING — regression suite for the silent-wedge bugs an independent
// review found in the behavior/locomotion runtime. Every fix here was manually
// validated; this file ENCODES those validated scenarios as regressions. The recipes
// are transcribed from the review's VALIDATED setups (tick/reason numbers logged).
//
// Sections (one fix class each):
//   (A) launch-interrupted / no-launch-clip   — standalone locomotion, marker binding
//   (B) no-landing                            — landing surface cut mid-flight
//   (C) airborne heal impact                  — wall healed into the arc → blocked+airborne
//   (D) route-stale at leg transition         — heal invalidates the next leg → replan fail
//   (E) fresh-runtime snapshot restore        — registry rebind; no-registry throws
//   (F) interruption / restart                — behavior:interrupted; blocked→restart clean
//   (G) capability gating                     — cannot-walk / cannot-jump
//   (H) zero-duration steps                   — wait{0} / strikePose{0} complete now
//   (I) boundary jump                         — rise EXACTLY maxJumpHeight: loud, never wrong
//   (J) fly collision                         — flyTo behind a wall → blocked at the wall
//   (K) fly clamp                             — huge flySpeed lands on target, no overshoot
import { test, expect } from 'bun:test'
import type { WorldDocV2, CharacterDoc } from '@dash/schema'
import { createBlender, createLocomotion, createContext, createMutableWorld, panelEdges } from '../src/index'
import {
  rig,
  character,
  clips,
  poses,
  names,
  STEP,
  newRuntime,
  snapFeet,
  step,
  driveUntilDone,
  driveToCompletion,
  assertHaltStable,
  eventsOf,
} from './harness'

const FLOOR_Y = 300

/** The common floor world (optionally damageable) used across the jump recipes. */
function floorWorld(damageable = false): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'floor',
        components: {
          transform: { x: 0, y: FLOOR_Y },
          surface: { box: { x: 0, y: FLOOR_Y, w: 600, h: 20 }, anchor: { dx: 300, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 600, y2: FLOOR_Y }] },
          ...(damageable ? { damageable: {} } : {}),
        },
      },
      { id: 'B', components: { transform: { x: 320, y: FLOOR_Y } } },
    ],
  } as WorldDocV2
}

function reasonOf(e: { payload: unknown }): string {
  return (e.payload as { reason?: string }).reason ?? ''
}

// ── (A) launch-interrupted + no-launch-clip — standalone locomotion ─────────────────
// The runtime does not expose its blender, so these two use a hand-wired locomotion
// (createBlender + createLocomotion) driven with the same pre/post-blend order the
// runtime uses. That lets an EXTERNAL setSource (an interruption) and a
// markers-stripped clip be injected precisely.

/** Build a standalone locomotion over the floor world, character at {160,264}. */
function standalone(clipMap: Record<string, (typeof clips)[keyof typeof clips]> = clips) {
  const ctx = createContext({ seed: 7 })
  const mw = createMutableWorld(floorWorld(), { character, events: ctx.events, stepMs: STEP })
  const blender = createBlender(rig, { initialPose: poses.stand })
  const transform = { x: 160, y: 264, rot: 0, facing: 1 as const }
  const capsule = () => ({ x0: transform.x, y0: transform.y - 20, x1: transform.x, y1: transform.y + 25, r: 10 })
  const loco = createLocomotion({
    rig, character, world: mw, blender, events: ctx.events, characterId: 'dash',
    clips: clipMap, poses, names, transform, capsule, hipHeight: 36,
  })
  return { ctx, mw, blender, transform, loco }
}

test('(A) launch-interrupted: an external setSource during anticipation cancels the marker wait and fails loudly', () => {
  const { ctx, blender, loco } = standalone()
  loco.begin({ verb: 'jumpTo', target: 'entity:B' } as never)
  // 20 ticks of anticipation — launch marker (t=320ms ≈ tick 39) has NOT fired yet.
  for (let i = 0; i < 20; i++) {
    loco.preBlend()
    const { markers } = blender.tick()
    loco.postBlend(markers)
  }
  expect(loco.status).toBe('running')
  expect(loco.mode).toBe('jump')

  // External interruption: the blender's base source is yanked off the jump clip.
  blender.setSource(poses.stand, { durationMs: 100 })
  loco.preBlend()
  const { markers } = blender.tick()
  loco.postBlend(markers) // the marker wait, bound to the source, cancels → fail

  const failed = ctx.events.trace().filter((e) => e.type === 'intent:failed')
  console.log(`[A/launch-interrupted] status=${loco.status} reason=${failed.map(reasonOf).join(',')}`)
  expect(loco.status).toBe('failed')
  expect(failed).toHaveLength(1)
  expect(reasonOf(failed[0])).toBe('launch-interrupted')
})

test('(A) no-launch-clip: jumping with a clip that has no launch marker fails IMMEDIATELY at begin', () => {
  // Same standalone, but the jump clip's markers are stripped — no 'launch' marker.
  const strippedJump = { ...clips.jump, markers: [] as { t: number; event: string }[] }
  const { ctx, loco } = standalone({ ...clips, jump: strippedJump as never })
  loco.begin({ verb: 'jumpTo', target: 'entity:B' } as never) // resolves + validates the clip synchronously

  const failed = ctx.events.trace().filter((e) => e.type === 'intent:failed')
  console.log(`[A/no-launch-clip] status=${loco.status} reason=${failed.map(reasonOf).join(',')}`)
  expect(loco.status).toBe('failed')
  expect(failed).toHaveLength(1)
  expect(reasonOf(failed[0])).toBe('no-launch-clip')
})

// ── (B) no-landing — landing surface cut out from under a jump mid-flight ────────────
test('(B) no-landing: cutting the floor mid-flight fails the jump loudly and stays bounded', () => {
  const r = newRuntime(floorWorld(true), { x: 160, y: FLOOR_Y })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'nl', steps: [{ verb: 'jumpTo', target: 'entity:B' }] })

  let cutDone = false
  let ticks = 0
  for (; ticks < 1200; ticks++) {
    step(r)
    if (!cutDone && r.rt.locomotion.mode === 'jump' && eventsOf(r, 'jump:launch').length > 0) {
      // remove the whole landing surface while the character is airborne.
      r.mw.cut('floor', { edge: 'roof', start: 100, width: 400 }, { persistScope: 'session' })
      cutDone = true
    }
    if (!r.rt.running()) break
  }
  const failed = eventsOf(r, 'intent:failed')
  console.log(`[B/no-landing] ticks=${ticks} cut=${cutDone} reason=${failed.map(reasonOf).join(',')}`)
  expect(cutDone).toBe(true)
  expect(failed).toHaveLength(1)
  expect(reasonOf(failed[0])).toBe('no-landing')
  expect(r.rt.behavior.status).toBe('halted')
  expect(ticks).toBeLessThan(1200) // bounded — never falls forever
  assertHaltStable(r)
})

// ── (C)/(D) shared breached-panel fixture (the pathing.test.ts family) ───────────────
// P is a tall DAMEAGEABLE 4-wall panel; Q sits deep inside it; B sits just outside to
// the right at Q's roof level. A tall breach cut in P.wallR opens a ballistic path.
const FX = {
  P: { x: 0, y: 0, w: 160, h: 300 },
  Q: { x: 100, y: 180, w: 24, h: 20 },
  level: 180,
}

function breachFixture(bBox: { x: number; y: number; w: number; h: number }): WorldDocV2 {
  const mk = (id: string, box: { x: number; y: number; w: number; h: number }, damageable = false) => ({
    id,
    components: {
      transform: { x: box.x, y: box.y },
      surface: { box, anchor: { dx: box.w / 2, dy: 0 } },
      collidable: { shape: 'segments' as const, segments: panelEdges(box) },
      ...(damageable ? { damageable: {} } : {}),
    },
  })
  return { schemaVersion: 2, seed: 1, entities: [mk('P', FX.P, true), mk('Q', FX.Q), mk('B', bBox)] } as WorldDocV2
}

const GROUND: CharacterDoc = {
  ...character,
  id: 'ground',
  locomotion: { modes: ['walk', 'hop'], maxJumpDistance: 200, maxJumpHeight: 120 },
}

test('(C) airborne impact: a wall healed into the arc mid-flight → intent:blocked with airborne, halted', () => {
  const B = { x: 170, y: 180, w: 60, h: 20 } // NARROW → router picks a single direct jump through the breach
  const r = newRuntime(breachFixture(B), { x: B.x + 55, y: FX.level }, GROUND)
  // Open the breach with a heal timer: it reappears ~tick 36 (300ms), mid-flight. The
  // heal counts down on stepMutations, so cutting before the first step() matches the
  // validated timing (heal ~tick 36, launch ~39).
  r.mw.cut('P', { edge: 'wallR', start: 30, width: 175 }, { healAfterMs: 300 })
  snapFeet(r.rt, FX.level)
  r.rt.runBehavior({ schemaVersion: 2, id: 'air', steps: [{ verb: 'moveTo', target: 'node:Q:roofR' }] })

  const ticks = driveUntilDone(r, 1500)
  const blocked = eventsOf(r, 'intent:blocked')
  const airborneBlocked = blocked.filter((e) => (e.payload as { airborne?: boolean }).airborne === true)
  console.log(`[C/airborne] ticks=${ticks} blocked=${blocked.length} airborne=${airborneBlocked.length} status=${r.rt.locomotion.status}`)
  expect(airborneBlocked).toHaveLength(1)
  expect(r.rt.behavior.status).toBe('halted')
  assertHaltStable(r)
})

test('(D) route-stale: a heal invalidating the next leg at a transition → loud failure, halted', () => {
  // B is WIDE enough that a direct hop from its right end to Q exceeds maxJumpDistance,
  // so the router must WALK the length of B to its left end (near the breach) and only
  // THEN hop through — a genuine two-leg walk+hop route. The wall heals early (300ms)
  // during the long walk; at the walk→hop transition the hop is revalidated against the
  // healed wall, is infeasible, the replan finds nothing → route-stale.
  const B = { x: 170, y: 180, w: 200, h: 20 }
  const r = newRuntime(breachFixture(B), { x: B.x + 190, y: FX.level }, GROUND)
  r.mw.cut('P', { edge: 'wallR', start: 30, width: 175 }, { healAfterMs: 300 }) // heals during the walk leg
  snapFeet(r.rt, FX.level)
  r.rt.runBehavior({ schemaVersion: 2, id: 'stale', steps: [{ verb: 'moveTo', target: 'node:Q:roofR' }] })

  const ticks = driveUntilDone(r, 3000)
  const failed = eventsOf(r, 'intent:failed')
  const blocked = eventsOf(r, 'intent:blocked')
  const airborneBlocked = blocked.filter((e) => (e.payload as { airborne?: boolean }).airborne === true)
  const staleFail = failed.filter((e) => reasonOf(e) === 'route-stale')
  console.log(
    `[D/route-stale] ticks=${ticks} failedReasons=${failed.map(reasonOf).join(',')} airborneBlocked=${airborneBlocked.length} status=${r.rt.locomotion.status}`,
  )
  // Either a route-stale failure (walk→hop revalidation found nothing) OR an airborne
  // block (if the router took a direct jump) — always LOUD, never a silent wrong path.
  expect(staleFail.length + airborneBlocked.length).toBeGreaterThanOrEqual(1)
  expect(r.rt.behavior.status).toBe('halted')
  assertHaltStable(r)
})

// ── (E) fresh-runtime snapshot restore (P8 registry rebind) ─────────────────────────
test('(E) a mid-jump snapshot restores identically onto a FRESH runtime with the behavior registry', () => {
  const doc = { schemaVersion: 2 as const, id: 'restore-doc', steps: [{ verb: 'jumpTo' as const, target: 'entity:B' }] }

  const r1 = newRuntime(floorWorld(), { x: 160, y: FLOOR_Y })
  snapFeet(r1.rt, FLOOR_Y)
  r1.rt.runBehavior(doc)
  // drive r1 to mid-air: jump mode AND a launch has fired.
  let guard = 0
  while (!(r1.rt.locomotion.mode === 'jump' && eventsOf(r1, 'jump:launch').length > 0)) {
    step(r1)
    if (++guard > 500) throw new Error('r1 never reached mid-air')
  }
  const S = { char: r1.rt.getState(), verlet: r1.verlet.getState(), rng: r1.ctx.rng.getState() }
  // continue r1 to completion; record its final transform.
  driveToCompletion(r1, 1000)
  const finalX = r1.rt.transform.x
  const finalY = r1.rt.transform.y
  expect(['arrived', 'idle']).toContain(r1.rt.locomotion.status) // completed cleanly

  // FRESH runtime WITH the registry: restore the mid-jump snapshot and continue.
  const r2 = newRuntime(floorWorld(), { x: 160, y: FLOOR_Y }, character, { behaviors: { [doc.id]: doc } })
  r2.rt.setState(S.char)
  r2.verlet.setState(S.verlet)
  r2.ctx.rng.setState(S.rng)
  driveToCompletion(r2, 1000)
  console.log(
    `[E/restore] r1 final=(${finalX.toFixed(4)},${finalY.toFixed(4)}) r2 final=(${r2.rt.transform.x.toFixed(4)},${r2.rt.transform.y.toFixed(4)})`,
  )
  expect(Math.abs(r2.rt.transform.x - finalX)).toBeLessThan(1e-9)
  expect(Math.abs(r2.rt.transform.y - finalY)).toBeLessThan(1e-9)
  expect(r2.rt.running()).toBe(false)

  // FRESH runtime WITHOUT the registry: setState of a mid-behavior snapshot must THROW
  // (rebinding a behaviorId with no registered doc is a hard error, never a wrong doc).
  const r3 = newRuntime(floorWorld(), { x: 160, y: FLOOR_Y })
  expect(() => r3.rt.setState(S.char)).toThrow()
})

// ── (F) interruption / restart ──────────────────────────────────────────────────────
test('(F) runBehavior while another is running emits behavior:interrupted, then runs the new doc cleanly', () => {
  const doc1 = { schemaVersion: 2 as const, id: 'doc1', steps: [{ verb: 'moveTo' as const, target: 'entity:B' }] }
  const doc2 = { schemaVersion: 2 as const, id: 'doc2', steps: [{ verb: 'wait' as const, ms: 50 }] }

  const r = newRuntime(floorWorld(), { x: 160, y: FLOOR_Y })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior(doc1)
  for (let i = 0; i < 30; i++) step(r) // walking, still running
  expect(r.rt.running()).toBe(true)

  r.rt.runBehavior(doc2) // interrupt
  const interrupted = eventsOf(r, 'behavior:interrupted')
  console.log(`[F/interrupt] interrupted=${interrupted.length} behaviorId=${(interrupted[0]?.payload as { behaviorId?: string })?.behaviorId}`)
  expect(interrupted).toHaveLength(1)
  expect((interrupted[0].payload as { behaviorId: string }).behaviorId).toBe('doc1')

  driveToCompletion(r, 100)
  expect(r.rt.behavior.status).toBe('complete')
})

test('(F) restart after a BLOCKED halt runs the next behavior clean (no stale blocked leak)', () => {
  // 4-wall cell (from locomotion.blocked.test.ts): a moveTo to a goal outside blocks.
  const BOX = { x: 100, y: 100, w: 200, h: 200 }
  const GOAL = { x: BOX.x + BOX.w + 120, y: BOX.y + BOX.h / 2 }
  const cell: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'cell',
        components: {
          transform: { x: BOX.x, y: BOX.y },
          surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } },
          collidable: { shape: 'segments', segments: panelEdges(BOX) },
        },
      },
      { id: 'goal', components: { transform: { x: GOAL.x, y: GOAL.y } } },
    ],
  }
  const r = newRuntime(cell, { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 })
  r.rt.runBehavior({ schemaVersion: 2, id: 'blk', steps: [{ verb: 'moveTo', target: 'entity:goal' }] })
  driveUntilDone(r, 2000)
  expect(r.rt.locomotion.status).toBe('blocked')
  expect(r.rt.behavior.status).toBe('halted')

  // Restart the SAME runtime with a fresh behavior — no stale blocked/failed leak.
  r.rt.runBehavior({ schemaVersion: 2, id: 'after', steps: [{ verb: 'wait', ms: 50 }] })
  const ticks = driveToCompletion(r, 100)
  console.log(`[F/restart] wait completed in ${ticks} ticks status=${r.rt.behavior.status}`)
  expect(r.rt.behavior.status).toBe('complete')
})

// ── (G) capability gating ───────────────────────────────────────────────────────────
test('(G) a fly-only character fails moveTo with cannot-walk and halts', () => {
  const flyer: CharacterDoc = { ...character, id: 'flyer', locomotion: { modes: ['fly'], flySpeed: 200 } }
  const r = newRuntime(floorWorld(), { x: 160, y: FLOOR_Y }, flyer)
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'g1', steps: [{ verb: 'moveTo', target: 'entity:B' }] })
  driveToCompletion(r, 200)
  const failed = eventsOf(r, 'intent:failed')
  console.log(`[G/cannot-walk] reason=${failed.map(reasonOf).join(',')}`)
  expect(failed).toHaveLength(1)
  expect(reasonOf(failed[0])).toBe('cannot-walk')
  expect(r.rt.behavior.status).toBe('halted')
})

test('(G) a walk-only character fails jumpTo with cannot-jump and halts', () => {
  const walker: CharacterDoc = { ...character, id: 'walker', locomotion: { modes: ['walk'] } }
  const r = newRuntime(floorWorld(), { x: 160, y: FLOOR_Y }, walker)
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'g2', steps: [{ verb: 'jumpTo', target: 'entity:B' }] })
  driveToCompletion(r, 200)
  const failed = eventsOf(r, 'intent:failed')
  console.log(`[G/cannot-jump] reason=${failed.map(reasonOf).join(',')}`)
  expect(failed).toHaveLength(1)
  expect(reasonOf(failed[0])).toBe('cannot-jump')
  expect(r.rt.behavior.status).toBe('halted')
})

// ── (H) zero-duration steps ─────────────────────────────────────────────────────────
test('(H) wait{ms:0} and strikePose{holdMs:0} complete immediately, never wedge', () => {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'zero',
    steps: [
      { verb: 'wait', ms: 0 },
      { verb: 'strikePose', ref: 'cheer', holdMs: 0 },
      { verb: 'say', text: 'hi' },
    ],
  })
  const ticks = driveToCompletion(r, 50) // must NOT throw (no wedge)
  const complete = eventsOf(r, 'intent:complete')
  const verbs = complete.map((e) => (e.payload as { verb: string }).verb)
  console.log(`[H/zero-duration] ticks=${ticks} completeVerbs=${JSON.stringify(verbs)}`)
  expect(verbs).toEqual(['wait', 'strikePose', 'say'])
  expect(r.rt.behavior.status).toBe('complete')
})

// ── (I) boundary jump — rise EXACTLY maxJumpHeight (120) ─────────────────────────────
test('(I) jumpTo requiring rise EXACTLY maxJumpHeight is loud-or-genuine, never a silent wrong landing', () => {
  // A platform whose feet-line is exactly 120px above the floor feet-line (=maxJumpHeight,
  // measured hip-to-hip since both stand hipHeight above their surface). Target marker on it.
  const world: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'floor',
        components: {
          transform: { x: 0, y: FLOOR_Y },
          surface: { box: { x: 0, y: FLOOR_Y, w: 600, h: 20 }, anchor: { dx: 300, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 600, y2: FLOOR_Y }] },
        },
      },
      {
        id: 'plat',
        components: {
          transform: { x: 150, y: 180 },
          surface: { box: { x: 150, y: 180, w: 170, h: 12 }, anchor: { dx: 85, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 150, y1: 180, x2: 320, y2: 180 }] },
        },
      },
      { id: 'T', components: { transform: { x: 200, y: 180 } } },
    ],
  }
  const r = newRuntime(world, { x: 160, y: FLOOR_Y })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'boundary', steps: [{ verb: 'jumpTo', target: 'entity:T' }] })
  const ticks = driveUntilDone(r, 1500)

  const arrived = eventsOf(r, 'intent:arrived')
  const failed = eventsOf(r, 'intent:failed')
  const blocked = eventsOf(r, 'intent:blocked')
  const cap = r.rt.capsule()
  const feetDist = Math.hypot(r.rt.transform.x - 200, cap.y1 + cap.r - 180)
  console.log(
    `[I/boundary] ticks=${ticks} arrived=${arrived.length} failed=${failed.map(reasonOf).join(',')} blocked=${blocked.length} feetDist=${feetDist.toFixed(2)}`,
  )
  if (arrived.length > 0) {
    // an arrival MUST be genuine — near the target, not a silent landing elsewhere.
    expect(feetDist).toBeLessThanOrEqual(8)
  } else {
    // otherwise it must have failed/blocked LOUDLY — never a silent give-up.
    expect(failed.length + blocked.length).toBeGreaterThanOrEqual(1)
  }
  expect(r.rt.running()).toBe(false)
  assertHaltStable(r)
})

// ── (J) fly collision ───────────────────────────────────────────────────────────────
test('(J) flyTo a target behind a wall → intent:blocked, capsule stops short of the wall, halted', () => {
  const WALL_X = 300
  const wallBox = { x: WALL_X, y: 100, w: 8, h: 200 } // thin panel; its left face is at WALL_X
  const world: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'wall',
        components: {
          transform: { x: WALL_X, y: 100 },
          surface: { box: wallBox, anchor: { dx: 4, dy: 100 } },
          collidable: { shape: 'segments', segments: panelEdges(wallBox) },
        },
      },
      { id: 'T', components: { transform: { x: 500, y: 200 } } },
    ],
  }
  const bird: CharacterDoc = { ...character, id: 'flybird', locomotion: { modes: ['fly'], flySpeed: 200 } }
  const r = newRuntime(world, { x: 100, y: 200 }, bird)
  r.rt.runBehavior({ schemaVersion: 2, id: 'flycol', steps: [{ verb: 'flyTo', target: 'entity:T' }] })
  const ticks = driveUntilDone(r, 1500)

  const blocked = eventsOf(r, 'intent:blocked')
  const capR = r.rt.capsule().r
  console.log(`[J/fly-collision] ticks=${ticks} blocked=${blocked.length} x=${r.rt.transform.x.toFixed(2)} wall=${WALL_X}`)
  expect(blocked.length).toBeGreaterThanOrEqual(1)
  expect(r.rt.transform.x).toBeLessThan(WALL_X) // stopped short of the wall plane
  expect(r.rt.transform.x + capR).toBeLessThanOrEqual(WALL_X + 1.0) // rests right at the wall
  expect(r.rt.behavior.status).toBe('halted')
  assertHaltStable(r)
})

// ── (K) fly clamp — a huge (schema-valid) flySpeed must not overshoot ────────────────
test('(K) flyTo with flySpeed 4000 lands on a near target within a few ticks, never overshooting', () => {
  const world: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [{ id: 'T', components: { transform: { x: 150, y: 150 } } }],
  }
  const fast: CharacterDoc = { ...character, id: 'clampbird', locomotion: { modes: ['fly'], flySpeed: 4000 } }
  const r = newRuntime(world, { x: 100, y: 150 }, fast)
  r.rt.runBehavior({ schemaVersion: 2, id: 'clamp', steps: [{ verb: 'flyTo', target: 'entity:T' }] })

  let maxOvershoot = 0
  let ticks = 0
  for (; ticks < 200; ticks++) {
    step(r)
    maxOvershoot = Math.max(maxOvershoot, r.rt.transform.x - 150) // any travel PAST the target (moving +x)
    if (!r.rt.running()) break
  }
  console.log(`[K/fly-clamp] ticks=${ticks} maxOvershoot=${maxOvershoot.toFixed(4)} status=${r.rt.locomotion.status}`)
  expect(r.rt.locomotion.status).toBe('arrived')
  expect(ticks).toBeLessThan(20) // near target + huge speed → a handful of ticks
  expect(maxOvershoot).toBeLessThanOrEqual(6) // clamped to remaining distance — no oscillation past target
})
