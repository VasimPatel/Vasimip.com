// Stage 0 (parity recovery) — ONE-SHOT RUNS. Dynamic quips/beats (fidget chatter,
// poke lines, drop lines, back-nav beats) carry per-invocation text under a stable
// label. The old pattern registered a fresh doc literal under a fixed id per run and
// tripped the registry identity contract ("already registered with a different
// doc") on the SECOND different line — the review's live crash. runOneShot runs the
// steps ephemerally (doc = null, steps inline in the frame): repeatable, snapshot-
// exact, and invisible to the registry.
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { newRuntime, snapFeet, driveToCompletion, eventsOf } from './harness'

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
      { id: 'goal', components: { transform: { x: 520, y: FLOOR_Y } } },
    ],
  }
}

function grounded() {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  return r
}

test('repeated one-shots with the same label and different texts never collide', () => {
  const r = grounded()
  // The exact legacy crash sequence: two chatter lines, then a poke and a drop quip,
  // all under their stable labels. Before runOneShot this threw on the second chat.
  r.rt.runOneShot('__fidget:chat', [{ verb: 'say', text: 'just... standing here.' }])
  driveToCompletion(r)
  r.rt.runOneShot('__fidget:chat', [{ verb: 'say', text: 'nice cursor.' }])
  driveToCompletion(r)
  r.rt.runOneShot('__poke:quip', [{ verb: 'say', text: 'my spleen!' }])
  driveToCompletion(r)
  r.rt.runOneShot('__poke:quip', [{ verb: 'say', text: 'rude.' }])
  driveToCompletion(r)
  r.rt.runOneShot('__drop:quip', [{ verb: 'say', text: 'wheee!' }])
  driveToCompletion(r)
  r.rt.runOneShot('__drop:quip', [{ verb: 'say', text: 'gravity. classic.' }])
  driveToCompletion(r)
  const said = eventsOf(r, 'intent:say').map((e) => (e.payload as { text: string }).text)
  expect(said).toEqual([
    'just... standing here.',
    'nice cursor.',
    'my spleen!',
    'rude.',
    'wheee!',
    'gravity. classic.',
  ])
})

test('one-shots leave the registry untouched (contract still enforced for real docs)', () => {
  const r = grounded()
  const doc = { schemaVersion: 2 as const, id: 'real', steps: [{ verb: 'idle' as const }] }
  r.rt.runBehavior(doc)
  driveToCompletion(r)
  // A one-shot under the SAME id as a registered doc must not disturb the binding…
  r.rt.runOneShot('real', [{ verb: 'say', text: 'ephemeral' }])
  driveToCompletion(r)
  // …the registered doc still runs (same identity — no throw)…
  r.rt.runBehavior(doc)
  driveToCompletion(r)
  // …and the contract still rejects a DIFFERENT doc under a taken id.
  expect(() =>
    r.rt.runBehavior({ schemaVersion: 2, id: 'real', steps: [{ verb: 'say', text: 'impostor' }] }),
  ).toThrow(/already registered/)
})

test('one-shot ends with behavior:ended {reason: label} and returns to idle', () => {
  const r = grounded()
  r.rt.runOneShot('__fidget:wave', [{ verb: 'strikePose', ref: 'cheer', holdMs: 200 }])
  driveToCompletion(r)
  const ended = eventsOf(r, 'behavior:ended')
  expect(ended.length).toBe(1)
  expect((ended[0].payload as { reason: string }).reason).toBe('__fidget:wave')
  expect(r.rt.running()).toBe(false)
})

test('snapshot mid-one-shot restores onto a fresh runtime with an empty registry', () => {
  const r1 = grounded()
  r1.rt.runOneShot('__fidget:sneeze', [
    { verb: 'say', text: 'ah— ah— CHOO!' },
    { verb: 'strikePose', ref: 'cheer', holdMs: 400 },
  ])
  // advance into the strikePose hold, then snapshot mid-run.
  for (let i = 0; i < 12; i++) {
    r1.ctx.clock.advance()
    r1.rt.tick()
    r1.verlet.step()
    r1.mw.stepMutations()
  }
  expect(r1.rt.running()).toBe(true)
  const snap = r1.rt.getState()
  expect(snap.behavior.behaviorId).toBeNull() // docless — the restore contract needs no registry
  const r2 = grounded()
  r2.rt.setState(snap) // would throw "not in the registry" if one-shots stored an id
  driveToCompletion(r2)
  expect(r2.rt.running()).toBe(false)
  // The snapshot carries the one-shot's BUDGET (review blocker: a fresh runtime
  // restored budget 0 and the watchdog force-released on the next tick).
  expect(eventsOf(r2, 'watchdog:forced-release').length).toBe(0)
  // …and the restored run actually FINISHED its steps (the strikePose completed).
  expect(eventsOf(r2, 'behavior:ended').length).toBe(1)
})

test('a one-shot interrupts a running movement like run() does', () => {
  const r = grounded()
  r.rt.runBehavior({ schemaVersion: 2, id: 'trip', steps: [{ verb: 'moveTo', target: 'entity:goal' }] })
  for (let i = 0; i < 60; i++) {
    r.ctx.clock.advance()
    r.rt.tick()
    r.verlet.step()
    r.mw.stepMutations()
  }
  expect(r.rt.running()).toBe(true)
  const xMid = r.rt.transform.x
  r.rt.runOneShot('__poke:quip', [{ verb: 'say', text: 'oof!' }])
  expect(eventsOf(r, 'behavior:interrupted').length).toBe(1)
  driveToCompletion(r)
  // the walk stopped where it was interrupted (locomotion reset, no drift onward).
  expect(Math.abs(r.rt.transform.x - xMid)).toBeLessThan(2)
})
