// Phase 7a gate — FLY. A winged character steers to a target (flyTo, with arrival
// slowdown) and passes through a waypoint (flyThrough). Flight is a RUNTIME
// capability gate: a character whose modes lack 'fly' fails a flyTo with
// 'cannot-fly' (the SCHEMA still accepts the doc — gating is at execution).
import { test, expect } from 'bun:test'
import type { WorldDocV2, CharacterDoc } from '@dash/schema'
import { newRuntime, step, eventsOf, character } from './harness'

const FLOOR_Y = 300
function world(targetId: string, tx: number, ty: number): WorldDocV2 {
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
      { id: targetId, components: { transform: { x: tx, y: ty } } },
    ],
  }
}

const bird: CharacterDoc = { ...character, id: 'bird', locomotion: { modes: ['fly'], flySpeed: 200 } }
const dashNoFly: CharacterDoc = {
  ...character,
  id: 'dashNoFly',
  locomotion: { modes: ['walk', 'hop'], maxJumpHeight: 120, maxJumpDistance: 180 },
}

test('flyTo: a winged character reaches the target and arrives', () => {
  const r = newRuntime(world('T', 400, 150), { x: 100, y: 150 }, bird)
  r.rt.runBehavior({ schemaVersion: 2, id: 'f', steps: [{ verb: 'flyTo', target: 'entity:T' }] })
  for (let i = 0; i < 3000; i++) {
    step(r)
    if (!r.rt.running()) break
  }
  expect(r.rt.locomotion.status).toBe('arrived')
  expect(Math.hypot(r.rt.transform.x - 400, r.rt.transform.y - 150)).toBeLessThanOrEqual(6)
})

test('flyThrough: a winged character passes through the waypoint and completes', () => {
  const r = newRuntime(world('W', 300, 150), { x: 100, y: 150 }, bird)
  r.rt.runBehavior({ schemaVersion: 2, id: 'f', steps: [{ verb: 'flyThrough', target: 'entity:W' }] })
  for (let i = 0; i < 3000; i++) {
    step(r)
    if (!r.rt.running()) break
  }
  expect(r.rt.locomotion.status).toBe('arrived')
  expect(eventsOf(r, 'intent:complete').some((e) => (e.payload as { verb: string }).verb === 'flyThrough')).toBe(true)
})

test('a character without the fly mode fails a flyTo with cannot-fly and halts', () => {
  const r = newRuntime(world('T', 400, 150), { x: 100, y: 150 }, dashNoFly)
  r.rt.runBehavior({ schemaVersion: 2, id: 'f', steps: [{ verb: 'flyTo', target: 'entity:T' }] })
  for (let i = 0; i < 200; i++) {
    step(r)
    if (!r.rt.running()) break
  }
  const failed = eventsOf(r, 'intent:failed')
  expect(failed).toHaveLength(1)
  expect((failed[0].payload as { reason: string }).reason).toBe('cannot-fly')
  expect(r.rt.behavior.status).toBe('halted')
})
