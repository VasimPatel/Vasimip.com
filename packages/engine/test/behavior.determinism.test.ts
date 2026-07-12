// Phase 7a gate — DETERMINISM. A full behavior (moveTo then jumpTo) replays
// bit-identically from a fresh seeded runtime: identical trace AND identical state
// hash. And a MID-JUMP snapshot/restore lands identically — the airborne ballistic
// state is fully serializable (§3 rule 1).
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { hashState } from '../src/index'
import { newRuntime, snapFeet, step, type Runtime } from './harness'

const FLOOR_Y = 300
function world(): WorldDocV2 {
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
      { id: 'M', components: { transform: { x: 260, y: FLOOR_Y } } },
      { id: 'B', components: { transform: { x: 420, y: FLOOR_Y } } },
    ],
  }
}

const BEHAVIOR = {
  schemaVersion: 2 as const,
  id: 'd',
  steps: [
    { verb: 'moveTo' as const, target: 'entity:M' },
    { verb: 'jumpTo' as const, target: 'entity:B' },
  ],
}

function snapshot(r: Runtime) {
  return { char: r.rt.getState(), verlet: r.verlet.getState(), rng: r.ctx.rng.getState() }
}

test('the same behavior on the same seed produces an identical trace and state hash', () => {
  function run() {
    const r = newRuntime(world(), { x: 100, y: 0 })
    snapFeet(r.rt, FLOOR_Y)
    r.rt.runBehavior(BEHAVIOR)
    for (let i = 0; i < 600; i++) {
      step(r)
      if (!r.rt.running()) break
    }
    const trace = r.ctx.events.trace().map((e) => ({ tick: e.tick, type: e.type }))
    return { trace, hash: hashState(snapshot(r)) }
  }
  const a = run()
  const b = run()
  console.log(`[determinism] events=${a.trace.length} hashEq=${a.hash === b.hash}`)
  expect(a.trace).toEqual(b.trace)
  expect(a.hash).toBe(b.hash)
})

test('snapshot/restore MID-JUMP lands identically', () => {
  const r = newRuntime(world(), { x: 100, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  r.rt.runBehavior(BEHAVIOR)

  // Drive until airborne (mode 'jump' after the launch), then snapshot.
  let snap: ReturnType<typeof snapshot> | null = null
  for (let i = 0; i < 600; i++) {
    step(r)
    if (!snap && r.rt.locomotion.mode === 'jump' && r.rt.locomotion.getState().jLaunched) {
      snap = snapshot(r)
      break
    }
  }
  expect(snap).not.toBeNull()

  // Continue the SAME runtime to completion; record the golden final state + tail trace.
  const tailStart = r.ctx.events.trace().length
  for (let i = 0; i < 600; i++) {
    step(r)
    if (!r.rt.running()) break
  }
  const goldFinal = { x: r.rt.transform.x, y: r.rt.transform.y }
  const goldTail = r.ctx.events.trace().slice(tailStart).map((e) => e.type)

  // Restore the snapshot onto the SAME runtime and re-drive to completion.
  r.rt.setState(snap!.char)
  r.verlet.setState(snap!.verlet)
  r.ctx.rng.setState(snap!.rng)
  const tail2Start = r.ctx.events.trace().length
  for (let i = 0; i < 600; i++) {
    step(r)
    if (!r.rt.running()) break
  }
  const restoredFinal = { x: r.rt.transform.x, y: r.rt.transform.y }
  const restoredTail = r.ctx.events.trace().slice(tail2Start).map((e) => e.type)

  expect(restoredFinal.x).toBeCloseTo(goldFinal.x, 6)
  expect(restoredFinal.y).toBeCloseTo(goldFinal.y, 6)
  expect(restoredTail).toEqual(goldTail)
})
