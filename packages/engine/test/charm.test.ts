// Charm-layer units: expression acting, squash flourish, accessory chain.
// The charm layer is presentation, but its ENGINE pieces stay deterministic and
// snapshot-total like everything else — these tests pin that.

import { test, expect } from 'bun:test'
import type { RigTemplate } from '@dash/schema'
import {
  createAccessoryChain,
  createEventBus,
  createExpression,
  createSquashFlourish,
  createVerletWorld,
  hashState,
} from '../src/index'
import rigJson from '../../../content/engine/rig.dash.json'

const rig = rigJson as unknown as RigTemplate

// ── expression ────────────────────────────────────────────────────────────────

test('expression: events set the face, decay returns it to resting', () => {
  let tick = 0
  const bus = createEventBus(() => tick)
  const ex = createExpression(bus)

  expect(ex.face(0).brow).toBe('determined')
  expect(ex.face(0).mouth).toBe('smile')

  bus.emit('intent:blocked', {})
  expect(ex.face(0).brow).toBe('worried')
  expect(ex.face(0).intensity).toBe(1)

  // Hold, then decay back to resting.
  for (let i = 0; i < 600; i++) {
    tick++
    ex.step()
  }
  expect(ex.face(0).brow).toBe('determined')
  expect(ex.face(0).mouth).toBe('smile')
  expect(ex.face(0).intensity).toBeCloseTo(0.5, 5)
})

test('expression: snapshot/restore mid-decay resumes identically', () => {
  const mk = () => {
    let t = 0
    const bus = createEventBus(() => t)
    const ex = createExpression(bus)
    return { bus, ex, adv: () => { t++; ex.step() } }
  }
  const a = mk()
  a.bus.emit('jump:land', {})
  for (let i = 0; i < 30; i++) a.adv()

  const b = mk()
  b.ex.setState(a.ex.getState())
  for (let i = 0; i < 40; i++) {
    a.adv()
    b.adv()
  }
  expect(b.ex.getState()).toEqual(a.ex.getState())
})

// ── squash flourish ───────────────────────────────────────────────────────────

test('squash: kicks, settles to 1, stays settled; retrigger is velocity-continuous', () => {
  const s = createSquashFlourish()
  expect(s.active()).toBe(false)

  s.trigger('land')
  const first = s.tick()
  expect(first.sy).toBeLessThan(1) // squashed
  expect(first.sx).toBeGreaterThan(1)

  let ticks = 0
  while (s.active() && ticks < 240) {
    s.tick()
    ticks++
  }
  expect(ticks).toBeLessThan(240) // settled well within 2s
  const rest = s.tick()
  expect(rest.sx).toBeCloseTo(1, 2)
  expect(rest.sy).toBeCloseTo(1, 2)

  // Mid-flight retrigger: values jump to the kick but the next few ticks move
  // smoothly (no NaN, bounded rate).
  s.trigger('launch')
  s.tick()
  s.trigger('land')
  let prev = s.tick()
  for (let i = 0; i < 10; i++) {
    const cur = s.tick()
    expect(Math.abs(cur.sy - prev.sy)).toBeLessThan(0.2)
    prev = cur
  }
})

// ── accessory chain ───────────────────────────────────────────────────────────

function solvedStub(x: number, y: number) {
  return {
    bones: [{ id: 'neck', ox: x, oy: y, ex: x, ey: y - 7, worldAngle: -Math.PI / 2 }],
  } as unknown as Parameters<ReturnType<typeof createAccessoryChain>['step']>[0]
}

test('accessory: deterministic given ticks; streams BEHIND the facing direction', () => {
  const run = () => {
    const w = createVerletWorld()
    const chain = createAccessoryChain(w, rig, 'dash', { anchorJoint: 'neck' })
    for (let t = 1; t <= 600; t++) {
      chain.step(solvedStub(100, 80), t, 1)
      w.step()
    }
    return { pts: chain.points().map((p) => ({ ...p })), hash: hashState(w.getState()) }
  }
  const a = run()
  const b = run()
  expect(a.hash).toBe(b.hash)

  // Facing +1 (right): the tail streams LEFT of the anchor (behind).
  const tail = a.pts[a.pts.length - 1]
  expect(tail.x).toBeLessThan(100 - 10)

  // Flip facing: the tail crosses to the other side.
  const w2 = createVerletWorld()
  const c2 = createAccessoryChain(w2, rig, 'dash', { anchorJoint: 'neck' })
  for (let t = 1; t <= 600; t++) {
    c2.step(solvedStub(100, 80), t, -1)
    w2.step()
  }
  const tail2 = c2.points()[c2.points().length - 1]
  expect(tail2.x).toBeGreaterThan(100 + 10)
})

test('accessory: unknown anchor joint throws', () => {
  const w = createVerletWorld()
  expect(() => createAccessoryChain(w, rig, 'dash', { anchorJoint: 'nope' })).toThrow(/no joint/)
})
