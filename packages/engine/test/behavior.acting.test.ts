// Parity recovery Stage 2a — THE ACTING LAYER. Cue strikePose/playClip were
// trace-only (the review's core gap): schema-valid behaviors promised vault poses
// mid-jump and rendered a generic arc. Cues now act on the blender's concurrent
// acting layer; strikePose {hold:'persist'} restores the v1 arrival semantics
// (pose persists until the next transition, character stays interactable).
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { newRuntime, snapFeet, step, driveToCompletion, eventsOf, poses } from './harness'

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
          surface: { box: { x: 0, y: FLOOR_Y, w: 900, h: 20 }, anchor: { dx: 450, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 900, y2: FLOOR_Y }] },
        },
      },
      { id: 'goal', components: { transform: { x: 700, y: FLOOR_Y } } },
    ],
  }
}

function grounded() {
  const r = newRuntime(floorWorld(), { x: 150, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  return r
}

/** Max |angle error| between the solved-adjacent blend state and a pose's angles.
 * Uses the runtime's own blender snapshot (post-restore-safe, render-agnostic). */
function poseError(r: ReturnType<typeof grounded>, poseId: keyof typeof poses): number {
  const target = poses[poseId].angles
  const joints = r.rt.getState().blender.joints
  let worst = 0
  for (const [id, want] of Object.entries(target)) {
    const have = joints[id]?.angle ?? 0
    let d = Math.abs(have - (want as number))
    if (d > Math.PI) d = 2 * Math.PI - d
    worst = Math.max(worst, d)
  }
  return worst
}

test('an onLaunch strikePose cue VISIBLY acts during a jump (and reports acted)', () => {
  const r = grounded()
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'vaultish',
    steps: [{ verb: 'jumpTo', target: 'entity:goal', timeoutMs: 8000 }],
    cues: [{ at: 'onLaunch', do: { verb: 'strikePose', ref: 'cheer', holdMs: 450 } }],
  } as never)
  // drive until the cue has fired and had ~250ms to blend in
  let cueTick = -1
  for (let i = 0; i < 2000 && r.rt.running(); i++) {
    step(r)
    if (cueTick < 0 && eventsOf(r, 'cue:strikePose').length > 0) cueTick = i
    if (cueTick >= 0 && i === cueTick + 30) break
  }
  expect(cueTick).toBeGreaterThanOrEqual(0)
  const ev = eventsOf(r, 'cue:strikePose')[0]
  expect((ev.payload as { acted: boolean }).acted).toBe(true)
  // mid-flight the skeleton is chasing the CHEER pose, not the tuck/walk base
  expect(poseError(r, 'cheer')).toBeLessThan(0.35)
  expect(r.rt.getState().blender.acting).toBeTruthy()
  driveToCompletion(r, 4000)
  // …and the hold expired: acting released, snapshot carries no acting key
  expect(r.rt.getState().blender.acting ?? null).toBeNull()
})

test("strikePose {hold:'persist'} completes instantly, persists visibly, and survives quips", () => {
  const r = grounded()
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'arrival-fight',
    steps: [{ verb: 'strikePose', ref: 'think', hold: 'persist' }],
  } as never)
  driveToCompletion(r, 200) // completes in ticks, not a 12s dwell
  expect(r.rt.running()).toBe(false)
  // settle a beat: the pose is held while IDLE (interactable)
  for (let i = 0; i < 120; i++) step(r)
  expect(r.rt.activeSource().id).toBe('think')
  expect(poseError(r, 'think')).toBeLessThan(0.25)
  // a say-only one-shot (poke quip) does NOT release the held pose
  r.rt.runOneShot('__poke:quip', [{ verb: 'say', text: 'oof!' }])
  driveToCompletion(r, 400)
  for (let i = 0; i < 60; i++) step(r)
  expect(r.rt.activeSource().id).toBe('think')
  expect(poseError(r, 'think')).toBeLessThan(0.25)
})

test('a persist-held pose releases on the NEXT MOVEMENT (the v1 transition rule)', () => {
  const r = grounded()
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'arrival-fight',
    steps: [{ verb: 'strikePose', ref: 'think', hold: 'persist' }],
  } as never)
  driveToCompletion(r, 200)
  for (let i = 0; i < 60; i++) step(r)
  expect(r.rt.activeSource().id).toBe('think')
  r.rt.runBehavior({ schemaVersion: 2, id: 'walk-off', steps: [{ verb: 'moveTo', target: 'entity:goal' }] } as never)
  for (let i = 0; i < 30; i++) step(r)
  // released the moment the movement began — the walk owns the skeleton again
  expect(r.rt.getState().blender.acting ?? null).toBeNull()
  expect(r.rt.activeSource().id).not.toBe('think')
})

test('forceRelease clears a persist hold', () => {
  const r = grounded()
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'a',
    steps: [{ verb: 'strikePose', ref: 'cheer', hold: 'persist' }],
  } as never)
  driveToCompletion(r, 200)
  expect(r.rt.getState().blender.acting).toBeTruthy()
  r.rt.forceRelease()
  expect(r.rt.getState().blender.acting ?? null).toBeNull()
})

test('snapshot/restore mid-acting continues bit-identically', () => {
  const doc = {
    schemaVersion: 2,
    id: 'v',
    steps: [{ verb: 'jumpTo', target: 'entity:goal', timeoutMs: 8000 }],
    cues: [{ at: 'onLaunch', do: { verb: 'strikePose', ref: 'cheer', holdMs: 600 } }],
  } as never
  const r1 = grounded()
  r1.rt.runBehavior(doc)
  for (let i = 0; i < 2000 && eventsOf(r1, 'cue:strikePose').length === 0 && r1.rt.running(); i++) step(r1)
  for (let i = 0; i < 10; i++) step(r1) // a few ticks INTO the acting hold
  const snap = r1.rt.getState()
  expect(snap.blender.acting).toBeTruthy()
  // the P8 replay contract: a mid-behavior restore needs the doc in the registry
  const r2 = newRuntime(floorWorld(), { x: 150, y: 0 }, undefined, { behaviors: { v: doc } })
  snapFeet(r2.rt, FLOOR_Y)
  r2.rt.setState(snap)
  // drive both in lockstep; blended joints must match exactly every tick
  for (let i = 0; i < 200; i++) {
    step(r1)
    step(r2)
  }
  const j1 = r1.rt.getState().blender.joints
  const j2 = r2.rt.getState().blender.joints
  for (const id of Object.keys(j1)) {
    expect(j2[id].angle).toBe(j1[id].angle)
    expect(j2[id].vel).toBe(j1[id].vel)
  }
})

test('camera cue/step carries mult and fast through to intent:camera', () => {
  const r = grounded()
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'cam',
    steps: [{ verb: 'camera', to: 'entity:goal', ms: 400, mult: 1.22, fast: true }, { verb: 'camera' }],
  } as never)
  driveToCompletion(r, 200)
  const cams = eventsOf(r, 'intent:camera')
  expect(cams.length).toBe(2)
  expect(cams[0].payload).toMatchObject({ to: 'entity:goal', ms: 400, mult: 1.22, fast: true })
  expect((cams[1].payload as { to?: string }).to).toBeUndefined() // the CLEAR form
})
