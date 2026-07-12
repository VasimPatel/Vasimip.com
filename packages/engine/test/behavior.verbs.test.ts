// Phase 7a gate — VERB COVERAGE. Every executable + stubbed intent verb runs on a
// simple floor world and raises its documented trace event(s), deterministically.
// (Movement verbs have dedicated gates: locomotion.blocked / .jump / .pathing / .fly.)
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { STRIKE_HOLD_MS, createContext, createVerletWorld, createMutableWorld, createCharacterRuntime } from '../src/index'
import { newRuntime, snapFeet, driveUntilDone, eventsOf, character, STEP, rig, clips, poses, names } from './harness'

const FLOOR_Y = 300
function floorWorld(): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'F',
        components: {
          transform: { x: 0, y: FLOOR_Y },
          surface: { box: { x: 0, y: FLOOR_Y, w: 600, h: 20 }, anchor: { dx: 300, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 600, y2: FLOOR_Y }] },
        },
      },
    ],
  }
}

/** Spawn a runtime with feet on the floor and run a single-step behavior. */
function runVerb(step0: unknown) {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'v', steps: [step0 as never] })
  return r
}

test('idle completes the behavior', () => {
  const r = runVerb({ verb: 'idle' })
  // instantaneous verbs resolve at run() time, before any tick.
  expect(r.rt.behavior.status).toBe('complete')
})

test('wait {ms:100} completes after ~12 ticks', () => {
  const r = runVerb({ verb: 'wait', ms: 100 })
  const ticks = driveUntilDone(r, 100)
  expect(ticks).toBe(Math.ceil(100 / STEP)) // 12
  expect(r.rt.behavior.status).toBe('complete')
})

test('setFlag raises intent:setFlag and writes the flag store', () => {
  const r = runVerb({ verb: 'setFlag', flag: 'x' })
  const ev = eventsOf(r, 'intent:setFlag')
  expect(ev).toHaveLength(1)
  expect((ev[0].payload as { flag: string }).flag).toBe('x')
  expect(r.rt.behavior.flags.x).toBe(true)
})

test('playClip holds for its duration then completes', () => {
  const r = runVerb({ verb: 'playClip', ref: 'walk-cycle' })
  driveUntilDone(r, 400)
  expect(r.rt.behavior.status).toBe('complete')
  const done = eventsOf(r, 'intent:complete').filter((e) => (e.payload as { verb: string }).verb === 'playClip')
  expect(done).toHaveLength(1)
})

test('strikePose holds STRIKE_HOLD_MS (~72 ticks) then completes', () => {
  const r = runVerb({ verb: 'strikePose', ref: 'cheer' })
  const ticks = driveUntilDone(r, 200)
  expect(ticks).toBe(Math.ceil(STRIKE_HOLD_MS / STEP)) // 72
  expect(r.rt.behavior.status).toBe('complete')
})

test('impulse applies to a resolvable verlet body; a target that resolves to nothing does not', () => {
  // custom runtime: resolveVerletBody maps only 'p' → a registered prop body.
  const world = floorWorld()
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(world, { character, events: ctx.events, stepMs: STEP })
  const rt = createCharacterRuntime({
    rig, character, world: mw, verlet, rng: ctx.rng, events: ctx.events, clips, poses, names,
    restPose: poses.stand, initialTransform: { x: 200, y: 200, rot: 0, facing: 1 },
    resolveVerletBody: (ref) => (ref === 'p' ? 'p' : undefined),
  })
  verlet.addProp('p', { x: 260, y: 220, w: 20, h: 20, stiffnessClass: 'medium' })
  rt.runBehavior({ schemaVersion: 2, id: 'imp', steps: [{ verb: 'impulse', target: 'p', vec: [100, 0] }] })
  const applied = ctx.events.trace().filter((e) => e.type === 'intent:impulse')
  expect(applied).toHaveLength(1)
  expect((applied[0].payload as { applied: boolean }).applied).toBe(true)

  // a target that resolveVerletBody returns undefined for → applied === false.
  const rt2 = createCharacterRuntime({
    rig, character, world: mw, verlet, rng: ctx.rng, events: ctx.events, clips, poses, names,
    restPose: poses.stand, initialTransform: { x: 200, y: 200, rot: 0, facing: 1 },
    resolveVerletBody: (ref) => (ref === 'p' ? 'p' : undefined),
  })
  rt2.runBehavior({ schemaVersion: 2, id: 'imp2', steps: [{ verb: 'impulse', target: 'nope', vec: [100, 0] }] })
  const imp2 = ctx.events.trace().filter((e) => e.type === 'intent:impulse')
  expect((imp2[imp2.length - 1].payload as { applied: boolean }).applied).toBe(false)
})

test('the stub verbs each emit their single trace event and complete', () => {
  const cases: Array<{ step: Record<string, unknown>; type: string; check: (p: Record<string, unknown>) => void }> = [
    { step: { verb: 'say', text: 'hi' }, type: 'intent:say', check: (p) => expect(p.text).toBe('hi') },
    { step: { verb: 'sfx', kind: 'thud' }, type: 'intent:sfx', check: (p) => expect(p.kind).toBe('thud') },
    { step: { verb: 'camera', to: 'entity:F', ms: 200 }, type: 'intent:camera', check: (p) => expect(p.to).toBe('entity:F') },
    { step: { verb: 'emit', emitter: 'sparkle' }, type: 'intent:emit', check: (p) => expect(p.emitter).toBe('sparkle') },
    { step: { verb: 'attach', target: 'hat', point: 'head' }, type: 'intent:attach', check: (p) => expect(p.target).toBe('hat') },
    { step: { verb: 'detach', target: 'hat' }, type: 'intent:detach', check: (p) => expect(p.target).toBe('hat') },
  ]
  for (const c of cases) {
    const r = runVerb(c.step)
    const ev = eventsOf(r, c.type)
    expect(ev).toHaveLength(1)
    c.check(ev[0].payload as Record<string, unknown>)
    expect(r.rt.behavior.status).toBe('complete')
  }
})

test('branchOnFlag EXECUTES in 7b: flag unset → else (empty) → completes, no failure', () => {
  const r = runVerb({ verb: 'branchOnFlag', flag: 'x', then: [{ verb: 'setFlag', flag: 'inThen' }] })
  // flag x is unset → the (absent) else branch runs → nothing → completes cleanly.
  expect(eventsOf(r, 'intent:failed')).toHaveLength(0)
  const branch = eventsOf(r, 'intent:branch')
  expect(branch).toHaveLength(1)
  expect((branch[0].payload as { taken: boolean }).taken).toBe(false)
  expect(r.rt.behavior.flags.inThen).toBeUndefined()
  expect(r.rt.behavior.status).toBe('complete')
})

test('branchOnFlag EXECUTES in 7b: flag set → then sub-list runs', () => {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'br',
    steps: [
      { verb: 'setFlag', flag: 'x' },
      { verb: 'branchOnFlag', flag: 'x', then: [{ verb: 'setFlag', flag: 'inThen' }], else: [{ verb: 'setFlag', flag: 'inElse' }] },
    ] as never,
  })
  const branch = eventsOf(r, 'intent:branch')
  expect(branch).toHaveLength(1)
  expect((branch[0].payload as { taken: boolean }).taken).toBe(true)
  expect(r.rt.behavior.flags.inThen).toBe(true)
  expect(r.rt.behavior.flags.inElse).toBeUndefined()
  expect(r.rt.behavior.status).toBe('complete')
})
