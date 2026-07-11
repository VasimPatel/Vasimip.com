import { test, expect } from 'bun:test'
import { createRng } from '../src/index'

test('same seed → same first N values', () => {
  const a = createRng(1337)
  const b = createRng(1337)
  const av = Array.from({ length: 100 }, () => a.float())
  const bv = Array.from({ length: 100 }, () => b.float())
  expect(av).toEqual(bv)
})

test('different seeds diverge', () => {
  const a = createRng(1)
  const b = createRng(2)
  expect(a.float()).not.toBe(b.float())
})

test('float() stays in [0, 1)', () => {
  const r = createRng(42)
  for (let i = 0; i < 1000; i++) {
    const f = r.float()
    expect(f).toBeGreaterThanOrEqual(0)
    expect(f).toBeLessThan(1)
  }
})

test('int(minIncl, maxExcl) respects bounds and is integral', () => {
  const r = createRng(7)
  for (let i = 0; i < 1000; i++) {
    const n = r.int(3, 9)
    expect(Number.isInteger(n)).toBe(true)
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThan(9)
  }
})

test('state export/restore resumes an identical sequence', () => {
  const r = createRng(99)
  for (let i = 0; i < 50; i++) r.float()
  const saved = r.getState()
  const continued = Array.from({ length: 20 }, () => r.float())

  const r2 = createRng(0)
  r2.setState(saved)
  const resumed = Array.from({ length: 20 }, () => r2.float())

  expect(resumed).toEqual(continued)
})
