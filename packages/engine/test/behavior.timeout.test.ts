// Phase 7b — TIMEOUTS, GIVE-UP, and the hard-FAILURE path.
//  • a reachable target with an absurdly small timeoutMs → `intent:timeout` → the
//    DEFAULT GIVE-UP (shrug-and-sit) → ends gracefully at idle.
//  • a custom onTimeout reaction overrides the default give-up.
//  • an UNREACHABLE-but-not-blocked target (fly-only char walking) → the failure path:
//    a loud `intent:failed` and the behavior HALTS (not a give-up — 7a parity).
import { test, expect } from 'bun:test'
import type { WorldDocV2, CharacterDoc, BehaviorDoc } from '@dash/schema'
import { newRuntime, snapFeet, step, driveUntilDone, eventsOf, character, type Runtime } from './harness'

const FLOOR_Y = 300
function floorWorld(goalX = 500): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'F',
        components: {
          transform: { x: 0, y: FLOOR_Y },
          surface: { box: { x: 0, y: FLOOR_Y, w: 800, h: 20 }, anchor: { dx: 400, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 800, y2: FLOOR_Y }] },
        },
      },
      { id: 'goal', components: { transform: { x: goalX, y: FLOOR_Y } } },
    ],
  }
}
function spawn(world: WorldDocV2, x: number, char?: CharacterDoc): Runtime {
  const r = newRuntime(world, { x, y: 0 }, char)
  snapFeet(r.rt, FLOOR_Y)
  return r
}

test('a tiny timeoutMs on a reachable moveTo → intent:timeout → default give-up → idle', () => {
  const r = spawn(floorWorld(500), 100)
  // goal is 400px away (~4s walk) but timeoutMs is 50ms — the step times out first.
  r.rt.runBehavior({ schemaVersion: 2, id: 'to', steps: [{ verb: 'moveTo', target: 'entity:goal', timeoutMs: 50 }] })
  driveUntilDone(r, 3000)

  expect(eventsOf(r, 'intent:timeout')).toHaveLength(1)
  // the DEFAULT give-up ran (onTimeout with the engine's shrug-and-sit poses)…
  expect(eventsOf(r, 'reaction:run').some((e) => (e.payload as { trigger: string }).trigger === 'onTimeout')).toBe(true)
  const strikes = eventsOf(r, 'intent:complete').filter((e) => (e.payload as { verb: string }).verb === 'strikePose')
  expect(strikes.length).toBeGreaterThanOrEqual(1) // shrug and/or sit poses
  // …and the behavior ended gracefully, character stopped.
  expect(eventsOf(r, 'behavior:ended').some((e) => (e.payload as { reason: string }).reason === 'timeout')).toBe(true)
  expect(r.rt.running()).toBe(false)
})

test('a custom onTimeout reaction overrides the default give-up', () => {
  const r = spawn(floorWorld(500), 100)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'toCustom',
    steps: [{ verb: 'moveTo', target: 'entity:goal', timeoutMs: 50 }],
    reactions: { onTimeout: [{ verb: 'say', text: 'giving up' }] },
  } as BehaviorDoc)
  driveUntilDone(r, 3000)
  expect(eventsOf(r, 'intent:timeout')).toHaveLength(1)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'giving up')).toBe(true)
  expect(r.rt.running()).toBe(false)
})

test('an UNREACHABLE moveTo (fly-only character cannot walk) → loud intent:failed, HALTS', () => {
  const flyOnly: CharacterDoc = { ...character, id: 'bird', locomotion: { modes: ['fly'], flySpeed: 200 } }
  const r = spawn(floorWorld(400), 100, flyOnly)
  r.rt.runBehavior({ schemaVersion: 2, id: 'unreach', steps: [{ verb: 'moveTo', target: 'entity:goal' }] })
  driveUntilDone(r, 3000)

  const failed = eventsOf(r, 'intent:failed')
  expect(failed).toHaveLength(1)
  expect((failed[0].payload as { reason: string }).reason).toBe('cannot-walk')
  // a hard failure HALTS (it is not a graceful give-up) and never wedges.
  expect(r.rt.behavior.status).toBe('halted')
  expect(r.rt.running()).toBe(false)
})

// ── review fixes: timeout cancels the movement + boundary-tick arrival wins ────────

test('timeout MID-WALK freezes the position: the character stops the moment the timeout concludes', () => {
  const r = spawn(floorWorld(700), 100)
  r.rt.runBehavior({ schemaVersion: 2, id: 'frozen', steps: [{ verb: 'moveTo', target: 'entity:goal', timeoutMs: 400 }] })
  // drive to the timeout, capturing the position ON the timeout tick.
  let xAtTimeout: number | null = null
  for (let i = 0; i < 600; i++) {
    step(r)
    if (xAtTimeout === null && eventsOf(r, 'intent:timeout').length > 0) {
      xAtTimeout = r.rt.transform.x
      break
    }
  }
  expect(xAtTimeout).not.toBeNull()
  // through the give-up and long after, the character has NOT kept walking.
  for (let i = 0; i < 400; i++) step(r)
  expect(r.rt.running()).toBe(false)
  expect(Math.abs(r.rt.transform.x - xAtTimeout!)).toBeLessThanOrEqual(0.5)
  const y0 = r.rt.transform.y
  const x0 = r.rt.transform.x
  for (let i = 0; i < 120; i++) step(r)
  expect(Math.abs(r.rt.transform.x - x0)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(r.rt.transform.y - y0)).toBeLessThanOrEqual(0.5)
})

test('BOUNDARY: an arrival on the exact timeout-expiry tick is an ARRIVAL, never a timeout', () => {
  const STEP_MS = 1000 / 120
  // Pass 1 — measure: how many step-elapsed ticks does this exact moveTo take to
  // report arrived? (deterministic engine → the count is exact and repeatable).
  const probe = spawn(floorWorld(320), 200)
  probe.rt.runBehavior({ schemaVersion: 2, id: 'probe', steps: [{ verb: 'moveTo', target: 'entity:goal' }] })
  let arriveTicks = 0
  for (let i = 1; i < 3000; i++) {
    step(probe)
    if (eventsOf(probe, 'intent:arrived').length > 0) {
      arriveTicks = i
      break
    }
  }
  expect(arriveTicks).toBeGreaterThan(0)
  // Pass 2 — locomotion emits its arrival during tick N; the executor OBSERVES it on
  // tick N+1's advance, where stepElapsedMs = (N+1)*STEP_MS. Setting timeoutMs to
  // exactly that makes BOTH conditions true on the same advance — the terminal
  // status must win (the review boundary case).
  const r = spawn(floorWorld(320), 200)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'boundary',
    steps: [{ verb: 'moveTo', target: 'entity:goal', timeoutMs: (arriveTicks + 1) * STEP_MS }],
  })
  driveUntilDone(r, 3000)
  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(eventsOf(r, 'intent:timeout')).toHaveLength(0)
  expect(r.rt.behavior.status).toBe('complete')
})
