// ═══════════════════════════════════════════════════════════════════════════════
// THE WALL TEST — a NORTH-STAR acceptance gate (ENGINE_V2 §1). Phase 7b promotes it
// from the 7a blocked check to the full reaction form, and this file is PERMANENT:
// Phase 11 lifts it into CI's acceptance gates verbatim (named accordingly).
//
// ONE behavior doc ("run to the next panel" with an authored onBlocked reaction —
// bonk + "ow!" + a backward impulse). TWO worlds, differing ONLY in where the
// character starts against the LIVE geometry:
//   World A — enclosed by a panel wall → run, `intent:blocked`, the AUTHORED reaction
//             (bonk pose + say + backward impulse, DIRECTION asserted — the P5 lesson),
//             the behavior ENDS, and the character is halt-stable at idle.
//   World B — the SAME doc outside the wall → clean traversal, `intent:arrived`, and
//             NO reaction events at all.
// Plus: determinism (World A twice → identical trace) and snapshot/restore MID-REACTION.
//
// ── AUTHORED-CONTENT CHOICE (documented) ──────────────────────────────────────────
// The "bonk" is `strikePose squash-land` — the squash pose reads as an impact recoil.
// The P2/P3 content set ships no dedicated bonk CLIP; a real bonk clip is P9 content.
// The reaction is otherwise verbatim to the plan: bonk, say "ow!", impulse self back.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc } from '@dash/schema'
import { panelEdges, hashState } from '../src/index'
import { newRuntime, snapFeet, step, driveUntilDone, eventsOf, assertHaltStable, type Runtime } from './harness'

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

// ONE behavior, byte-identical between the two worlds — the whole point of the test.
const WALL_BEHAVIOR: BehaviorDoc = {
  schemaVersion: 2,
  id: 'wall-run',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
  reactions: {
    onBlocked: [
      { verb: 'strikePose', ref: 'squash-land', holdMs: 250 }, // the bonk (impact pose)
      { verb: 'say', text: 'ow!' },
      { verb: 'impulse', target: 'self', vec: [-140, -40] }, // backward = away from the wall (left)
    ],
  },
}

function snapshot(r: Runtime) {
  return { char: r.rt.getState(), verlet: r.verlet.getState(), rng: r.ctx.rng.getState() }
}

test('WALL TEST A — enclosed: run → blocked → authored bonk reaction → REAL knockback → ends at safe idle', () => {
  const r = newRuntime(cellWorld(), { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 })
  snapFeet(r.rt, BOX.y + BOX.h / 2)
  r.rt.runBehavior(WALL_BEHAVIOR)
  driveUntilDone(r, 3000)

  // 1. exactly one block, and the locomotion rested against the wall (the 7a invariant).
  const blocked = eventsOf(r, 'intent:blocked')
  expect(blocked).toHaveLength(1)
  expect(r.rt.locomotion.status).toBe('blocked')
  const restX = (blocked[0].payload as { x: number }).x // rest x at the wall

  // 2. the AUTHORED reaction ran: the bonk pose, the "ow!", and the backward impulse.
  expect(eventsOf(r, 'reaction:run').some((e) => (e.payload as { trigger: string }).trigger === 'onBlocked')).toBe(true)
  const say = eventsOf(r, 'intent:say')
  expect(say).toHaveLength(1)
  expect((say[0].payload as { text: string }).text).toBe('ow!')
  const imp = eventsOf(r, 'intent:impulse')
  expect(imp).toHaveLength(1)
  const vec = (imp[0].payload as { vec: [number, number] }).vec
  expect(vec[0]).toBeLessThan(0) // DIRECTION asserted: backward (away from the right wall)

  // 3. the behavior ENDED (blocked reactions end the behavior), speech bubble was set.
  expect(eventsOf(r, 'behavior:ended').some((e) => (e.payload as { reason: string }).reason === 'blocked')).toBe(true)
  expect(r.rt.running()).toBe(false)

  // 4. REAL knockback (review fix): the impulse displaced the TRANSFORM backward —
  //    not just the cosmetic secondary. Let the recoil decay, then assert the
  //    character rests measurably LEFT of the wall rest point, still inside the cell
  //    (bounded — it did not tunnel through the far wall).
  for (let i = 0; i < 180; i++) step(r) // recoil (~40 ticks) + speech decay
  expect(r.rt.transform.x).toBeLessThan(restX - 5)
  expect(r.rt.transform.x).toBeGreaterThan(BOX.x) // never through the left wall

  // 5. halt-stable at idle: X AND Y frozen, no further intent events (the full
  //    assertHaltStable contract).
  assertHaltStable(r)
})

test('WALL TEST B — outside: the SAME doc traverses cleanly, arrives, NO reaction', () => {
  const r = newRuntime(cellWorld(), { x: WALL_X + 40, y: BOX.y + BOX.h / 2 })
  r.rt.runBehavior(WALL_BEHAVIOR)
  driveUntilDone(r, 3000)

  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(eventsOf(r, 'intent:blocked')).toHaveLength(0)
  // NO reaction fired: no bonk, no "ow!", no impulse.
  expect(eventsOf(r, 'reaction:run')).toHaveLength(0)
  expect(eventsOf(r, 'intent:say')).toHaveLength(0)
  expect(eventsOf(r, 'intent:impulse')).toHaveLength(0)
  expect(r.rt.locomotion.status).toBe('arrived')
})

test('WALL TEST — determinism: World A run twice → identical trace and state hash', () => {
  function run() {
    const r = newRuntime(cellWorld(), { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 })
    snapFeet(r.rt, BOX.y + BOX.h / 2)
    r.rt.runBehavior(WALL_BEHAVIOR)
    driveUntilDone(r, 3000)
    // a few settle ticks so the tail is included identically.
    for (let i = 0; i < 60; i++) step(r)
    return {
      trace: r.ctx.events.trace().map((e) => ({ tick: e.tick, type: e.type })),
      hash: hashState(snapshot(r)),
    }
  }
  const a = run()
  const b = run()
  expect(a.trace).toEqual(b.trace)
  expect(a.hash).toBe(b.hash)
})

test('WALL TEST — snapshot/restore MID-REACTION lands identically', () => {
  const r = newRuntime(cellWorld(), { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 })
  snapFeet(r.rt, BOX.y + BOX.h / 2)
  r.rt.runBehavior(WALL_BEHAVIOR)

  // Drive until genuinely INSIDE the reaction: the onBlocked reaction has begun (the
  // bonk pose is holding) but the behavior is STILL running (say/impulse/end not yet
  // reached). This is a true mid-reaction snapshot.
  let snap: ReturnType<typeof snapshot> | null = null
  for (let i = 0; i < 3000; i++) {
    step(r)
    const reacting = r.ctx.events.trace().some((e) => e.type === 'reaction:run' && (e.payload as { trigger: string }).trigger === 'onBlocked')
    if (!snap && reacting && r.rt.running()) {
      snap = snapshot(r)
      break
    }
  }
  expect(snap).not.toBeNull()
  expect(r.rt.running()).toBe(true) // confirm we snapshotted DURING the reaction

  const tailStart = r.ctx.events.trace().length
  for (let i = 0; i < 600; i++) {
    step(r)
    if (!r.rt.running() && r.rt.speech() === null) break
  }
  const goldFinal = { x: r.rt.transform.x, y: r.rt.transform.y }
  const goldTail = r.ctx.events.trace().slice(tailStart).map((e) => e.type)

  r.rt.setState(snap!.char)
  r.verlet.setState(snap!.verlet)
  r.ctx.rng.setState(snap!.rng)
  const tail2Start = r.ctx.events.trace().length
  for (let i = 0; i < 600; i++) {
    step(r)
    if (!r.rt.running() && r.rt.speech() === null) break
  }
  const restoredFinal = { x: r.rt.transform.x, y: r.rt.transform.y }
  const restoredTail = r.ctx.events.trace().slice(tail2Start).map((e) => e.type)

  expect(restoredFinal.x).toBeCloseTo(goldFinal.x, 6)
  expect(restoredFinal.y).toBeCloseTo(goldFinal.y, 6)
  expect(restoredTail).toEqual(goldTail)
})
