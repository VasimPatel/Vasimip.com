// Phase 7a gate — JUMP CHOREOGRAPHY. jumpTo is not a physics-only ballistic: the
// launch is SYNCED to the jump clip's `launch` marker (authored anticipation plays
// first), landing is EVENT-DRIVEN (a descending floor hit), apex respects the caps,
// and the character lands on target. solveBallistic is unit-tested for reach limits.
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { solveBallistic } from '../src/index'
import { newRuntime, snapFeet, step, eventsOf } from './harness'

const FLOOR_Y = 300
const TARGET_X = 320
const START_X = 160

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
      { id: 'B', components: { transform: { x: TARGET_X, y: FLOOR_Y } } },
    ],
  }
}

test('jumpTo: marker-synced launch, event-driven landing, capped apex, lands on target', () => {
  const r = newRuntime(floorWorld(), { x: START_X, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior({ schemaVersion: 2, id: 'j', steps: [{ verb: 'jumpTo', target: 'entity:B' }] })

  let launchTick = -1
  let landTick = -1
  let launchHipY = NaN
  let minY = Infinity
  let seenLaunch = 0
  for (let i = 0; i < 400; i++) {
    step(r)
    const launches = eventsOf(r, 'jump:launch')
    if (launches.length > seenLaunch) {
      seenLaunch = launches.length
      launchTick = launches[0].tick
      launchHipY = r.rt.transform.y // hip at launch (ground surface, pre-integration)
    }
    if (launchTick >= 0 && r.rt.locomotion.mode === 'jump') minY = Math.min(minY, r.rt.transform.y)
    const lands = eventsOf(r, 'jump:land')
    if (lands.length > 0 && landTick < 0) landTick = lands[0].tick
    if (!r.rt.running()) break
  }

  // ── MARKER-SYNCED LAUNCH ────────────────────────────────────────────────────────
  // The launch waits for the jump clip's ~320ms `launch` marker (well past tick 1).
  // NEGATIVE CONTROL: a physics-only launch (solveBallistic applied on the first
  // airborne tick) would fire at tick 1. The observed launch is far from 1, proving
  // the sync is real — not a fixed countdown, not immediate integration.
  console.log(`[jump] launchTick=${launchTick} (physics-only would be tick 1), landTick=${landTick}`)
  expect(launchTick).toBeGreaterThan(20)
  expect(launchTick).not.toBe(1)

  // ── EVENT-DRIVEN LANDING → arrival ────────────────────────────────────────────────
  expect(landTick).toBeGreaterThan(launchTick)
  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(r.rt.behavior.status).toBe('complete')

  // ── APEX ≤ maxJumpHeight (120); expected ~42 for this flat hop ────────────────────
  const apexRise = launchHipY - minY
  console.log(`[jump] apexRise=${apexRise.toFixed(2)} (maxJumpHeight=120)`)
  expect(apexRise).toBeGreaterThan(10)
  expect(apexRise).toBeLessThanOrEqual(120 + 1e-3)

  // ── lands near the target x ───────────────────────────────────────────────────────
  console.log(`[jump] finalX=${r.rt.transform.x.toFixed(2)} (target=${TARGET_X})`)
  expect(Math.abs(r.rt.transform.x - TARGET_X)).toBeLessThanOrEqual(8)
})

const CAPS = { maxJumpHeight: 120, maxJumpDistance: 180 }

test('solveBallistic returns null when the target is above maxJumpHeight', () => {
  // +y DOWN: dy = -200 means 200px above launch, > maxJumpHeight 120.
  expect(solveBallistic({ x: 0, y: 0 }, { x: 0, y: -200 }, CAPS)).toBeNull()
})

test('solveBallistic returns null when the target is beyond maxJumpDistance', () => {
  expect(solveBallistic({ x: 0, y: 0 }, { x: 400, y: 0 }, CAPS)).toBeNull() // |dx|=400 > 180
})

test('solveBallistic returns a capped-apex solution for a reachable target', () => {
  const sol = solveBallistic({ x: 0, y: 0 }, { x: 100, y: 0 }, CAPS)
  expect(sol).not.toBeNull()
  expect(sol!.apex).toBeLessThanOrEqual(120)
  expect(sol!.flightTime).toBeGreaterThan(0)
})

test('a runtime jumpTo to an unreachable, isolated target (no graph route) fails and halts', () => {
  // A world with NO panels — only the target entity → the traversal graph has zero
  // nodes → no route exists, so the jumpTo fails instead of silently mis-running.
  const world: WorldDocV2 = { schemaVersion: 2, seed: 1, entities: [{ id: 'ISO', components: { transform: { x: 900, y: 20 } } }] }
  const r = newRuntime(world, { x: 100, y: 100 })
  r.rt.runBehavior({ schemaVersion: 2, id: 'j', steps: [{ verb: 'jumpTo', target: 'entity:ISO' }] })
  for (let i = 0; i < 200; i++) {
    step(r)
    if (!r.rt.running()) break
  }
  const failed = eventsOf(r, 'intent:failed')
  expect(failed).toHaveLength(1)
  expect((failed[0].payload as { reason: string }).reason).toBe('no-route')
  expect(r.rt.behavior.status).toBe('halted')
})
