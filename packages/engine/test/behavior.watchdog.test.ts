// Phase 7b — THE WATCHDOG (defense-in-depth). Force-release on total-bound overrun,
// and the PER-RUN LATCH: a stale run's expired window can NEVER kill a newer run.
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc } from '@dash/schema'
import { createWatchdog } from '../src/index'
import { newRuntime, snapFeet, step, eventsOf, type Runtime } from './harness'

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
function spawn(): Runtime {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  return r
}

test('watchdog FORCE-RELEASES a run that overruns its total bound → safe idle', () => {
  const r = spawn()
  const wd = createWatchdog(r.rt, { maxBehaviorMs: 500, events: r.ctx.events, characterId: 'dash' })
  // A pathological doc: a branch guarding a near-infinite wait — every individual step
  // is bounded (the 7a invariant), but this one never finishes on its own; the watchdog
  // is the only exit. Proves malformed content can never wedge the character.
  const doc: BehaviorDoc = {
    schemaVersion: 2,
    id: 'wedge',
    steps: [
      { verb: 'setFlag', flag: 'go' },
      { verb: 'branchOnFlag', flag: 'go', then: [{ verb: 'wait', ms: 100000 }] },
    ],
  }
  r.rt.runBehavior(doc)
  expect(r.rt.running()).toBe(true)

  let firedAtTick = -1
  for (let i = 0; i < 300; i++) {
    step(r)
    wd.tick()
    if (firedAtTick < 0 && !r.rt.running()) firedAtTick = i
  }
  const released = eventsOf(r, 'watchdog:forced-release')
  expect(released).toHaveLength(1) // fired exactly ONCE
  expect((released[0].payload as { runId: number }).runId).toBe(r.rt.runId())
  // fired near the 500ms bound (~60 ticks at 120 Hz), and the character is idle after.
  expect(firedAtTick).toBeGreaterThan(40)
  expect(firedAtTick).toBeLessThan(90)
  expect(r.rt.running()).toBe(false)
})

test('PER-RUN LATCH: interrupting run A with run B resets the window — A cannot kill B', () => {
  const r = spawn()
  const wd = createWatchdog(r.rt, { maxBehaviorMs: 400, events: r.ctx.events, characterId: 'dash' })

  // Run A: a near-infinite wait. Tick it to JUST UNDER its 400ms window (no release yet).
  r.rt.runBehavior({ schemaVersion: 2, id: 'A', steps: [{ verb: 'wait', ms: 100000 }] })
  const runIdA = r.rt.runId()
  for (let i = 0; i < 40; i++) {
    step(r) // ~333ms < 400ms bound
    wd.tick()
  }
  expect(eventsOf(r, 'watchdog:forced-release')).toHaveLength(0) // A not yet released

  // Interrupt with run B (short, completes on its own well within its own window).
  r.rt.runBehavior({ schemaVersion: 2, id: 'B', steps: [{ verb: 'wait', ms: 60 }] })
  expect(r.rt.runId()).toBeGreaterThan(runIdA) // new run → the latch key changed
  for (let i = 0; i < 40; i++) {
    step(r)
    wd.tick()
    if (!r.rt.running()) break
  }
  // B completed NORMALLY and A's stale ~333ms window never force-released B.
  expect(eventsOf(r, 'watchdog:forced-release')).toHaveLength(0)
  expect(eventsOf(r, 'behavior:complete').some((e) => (e.payload as { behaviorId: string }).behaviorId === 'B')).toBe(true)
})

// ── review fixes: the runtime OWNS its watchdog + mid-air release settles ──────────

test('RUNTIME-OWNED watchdog: a pathological behavior force-releases with NO manual watchdog ticking', () => {
  // No createWatchdog here, no wd.tick() — only the runtime's own tick loop. The
  // runtime instantiates + ticks its watchdog internally (the review blocker: a
  // production behavior must never wedge just because nobody wired a watchdog).
  const r = newRuntime(floorWorld(), { x: 200, y: 0 }, undefined, { watchdog: { maxBehaviorMs: 300 } })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'wedge-owned',
    steps: [
      { verb: 'setFlag', flag: 'go' },
      { verb: 'branchOnFlag', flag: 'go', then: [{ verb: 'wait', ms: 100000 }] },
    ],
  })
  expect(r.rt.running()).toBe(true)
  for (let i = 0; i < 120 && r.rt.running(); i++) step(r)
  expect(r.rt.running()).toBe(false)
  const released = eventsOf(r, 'watchdog:forced-release')
  expect(released).toHaveLength(1)
  expect((released[0].payload as { characterId: string }).characterId).toBe('dash')
})

test('force-release MID-JUMP settles the character onto a support — never left floating', () => {
  const world: WorldDocV2 = {
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
      { id: 'goal', components: { transform: { x: 380, y: FLOOR_Y } } },
    ],
  }
  const r = newRuntime(world, { x: 240, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'airjump', steps: [{ verb: 'jumpTo', target: 'entity:goal' }] })

  // drive until genuinely AIRBORNE (launched, well off the floor), then force-release.
  let airborne = false
  for (let i = 0; i < 600; i++) {
    step(r)
    const st = r.rt.locomotion.getState()
    const cap = r.rt.capsule()
    if (st.jLaunched && r.rt.locomotion.mode === 'jump' && FLOOR_Y - (cap.y1 + cap.r) > 15) {
      airborne = true
      break
    }
  }
  expect(airborne).toBe(true)
  r.rt.forceRelease() // the exact function the runtime-owned watchdog invokes
  expect(r.rt.running()).toBe(false)
  // feet snapped ONTO the floor (within the collision skin), not floating mid-arc.
  const cap = r.rt.capsule()
  expect(Math.abs(FLOOR_Y - (cap.y1 + cap.r))).toBeLessThanOrEqual(1.5)
  // and stays put: no residual airborne integration after release.
  const y0 = r.rt.transform.y
  for (let i = 0; i < 60; i++) step(r)
  expect(Math.abs(r.rt.transform.y - y0)).toBeLessThanOrEqual(0.5)
})
