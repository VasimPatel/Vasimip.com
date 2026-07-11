import { test, expect } from 'bun:test'
import { createLoop, STEP_MS, SIM_HZ } from '../src/index'

test('accumulator yields correct tick count + alpha for a fractional advance', () => {
  let ticks = 0
  const loop = createLoop(() => ticks++, { stepMs: 10 })
  const r = loop.advance(35) // 3.5 steps
  expect(r.ticks).toBe(3)
  expect(ticks).toBe(3)
  expect(r.alpha).toBeCloseTo(0.5, 10)
})

test('leftover carries across advances', () => {
  let ticks = 0
  const loop = createLoop(() => ticks++, { stepMs: 10 })
  expect(loop.advance(6).ticks).toBe(0) // acc = 6
  const r = loop.advance(6) // acc = 12 → 1 tick, acc = 2
  expect(r.ticks).toBe(1)
  expect(r.alpha).toBeCloseTo(0.2, 10)
})

test('clamps ticks per advance and discards the backlog', () => {
  let ticks = 0
  const loop = createLoop(() => ticks++, { stepMs: 10, maxTicks: 5 })
  const r = loop.advance(1000) // wants 100 steps
  expect(r.ticks).toBe(5)
  expect(r.alpha).toBe(0)
  // Backlog dropped: the next normal advance runs exactly one tick, not a flood.
  expect(loop.advance(10).ticks).toBe(1)
})

test('non-positive elapsed adds no time', () => {
  let ticks = 0
  const loop = createLoop(() => ticks++, { stepMs: 10 })
  expect(loop.advance(0).ticks).toBe(0)
  expect(loop.advance(-100).ticks).toBe(0)
  expect(ticks).toBe(0)
})

test('constants derive correctly', () => {
  expect(SIM_HZ).toBe(120)
  expect(STEP_MS).toBeCloseTo(1000 / 120, 12)
})

test('advance(STEP_MS) runs exactly one tick, repeatedly (headless drive path)', () => {
  let ticks = 0
  const loop = createLoop(() => ticks++)
  for (let i = 0; i < 1000; i++) expect(loop.advance(STEP_MS).ticks).toBe(1)
  expect(ticks).toBe(1000)
})
