// Phase 7a gate — THE WALL TEST (the crux). ONE moveTo behavior, TWO outcomes
// depending only on where the character starts against the LIVE geometry: enclosed
// in a 4-wall cell → walks into the wall and rests there (blocked); outside the cell
// → arrives cleanly. The behavior doc is byte-identical between the two runs.
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { panelEdges } from '../src/index'
import { newRuntime, driveUntilDone, eventsOf } from './harness'

const BOX = { x: 100, y: 100, w: 200, h: 200 }
const WALL_X = BOX.x + BOX.w // 300
const GOAL = { x: BOX.x + BOX.w + 120, y: BOX.y + BOX.h / 2 } // outside the right wall

function cellWorld(): WorldDocV2 {
  return {
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
}

const BEHAVIOR = { schemaVersion: 2 as const, id: 'wall', steps: [{ verb: 'moveTo' as const, target: 'entity:goal' }] }

test('WALL TEST (A): enclosed in the cell → the moveTo blocks, capsule resting at the wall', () => {
  const r = newRuntime(cellWorld(), { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 }) // dead center
  r.rt.runBehavior(BEHAVIOR)
  driveUntilDone(r, 2000)

  const blocked = eventsOf(r, 'intent:blocked')
  expect(blocked).toHaveLength(1) // exactly one block
  expect(r.rt.locomotion.status).toBe('blocked')

  // capsule RESTS just inside the wall: center left of the wall, its right edge at it.
  const rest = r.rt.transform.x
  const cap = r.rt.capsule()
  expect(rest).toBeLessThan(WALL_X)
  expect(Math.abs(rest + cap.r - WALL_X)).toBeLessThanOrEqual(1.5)
})

test('WALL TEST (B): the SAME behavior from OUTSIDE the cell → arrives cleanly, no block', () => {
  const r = newRuntime(cellWorld(), { x: WALL_X + 40, y: BOX.y + BOX.h / 2 }) // outside the right wall
  r.rt.runBehavior(BEHAVIOR)
  driveUntilDone(r, 2000)

  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(eventsOf(r, 'intent:blocked')).toHaveLength(0)
  expect(r.rt.locomotion.status).toBe('arrived')
})
