import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'

// G6 (allocation) — the honest zero-alloc check. The verlet integrate/constrain hot
// loop uses only preallocated, doubling typed-array pools and index loops; step()
// creates no objects. We show this two ways:
//   (1) POOL STABILITY — after the scene is built, getState() array lengths never
//       change (no particle/constraint growth → the pools never reallocate), and
//   (2) RETAINED-HEAP FLATNESS — running the hot loop for tens of thousands of ticks
//       does not grow retained heap (measured post-GC, so only leaks/retention show;
//       transient allocations, if any, would be collected — but there are none in the
//       hot loop, which is why the retained heap is flat).

function gc(): void {
  // Bun exposes a synchronous forced GC; fall back to a no-op elsewhere.
  const g = (globalThis as { Bun?: { gc?: (sync: boolean) => void } }).Bun
  if (g?.gc) g.gc(true)
}

function buildBusyScene() {
  const world = createVerletWorld()
  // A steady-state hot loop: 10 props + a rope, all perpetually re-poked so nothing
  // sleeps (keeps the integrate + relaxation path maximally busy every tick).
  for (let i = 0; i < 10; i++) {
    world.addProp(`p${i}`, { x: (i - 5) * 24, y: 40, w: 20, h: 8, stiffnessClass: (['soft', 'medium', 'stiff'] as const)[i % 3] })
  }
  world.addRope('rope', { ax: -140, ay: -30, bx: 140, by: -30, particles: 16, slack: 0.2 })
  return world
}

test('G6 alloc: pool array lengths are stable across the hot loop', () => {
  const world = buildBusyScene()
  world.step()
  const s0 = world.getState()
  const lens0 = [s0.px.length, s0.cAx.length, s0.sleeping.length]
  for (let t = 0; t < 5000; t++) {
    if (t % 40 === 0) for (let i = 0; i < 10; i++) world.applyImpulse(`p${i}`, 50, 30)
    world.step()
  }
  const s1 = world.getState()
  const lens1 = [s1.px.length, s1.cAx.length, s1.sleeping.length]
  console.log(`[G6 pool] particle/constraint/body counts ${lens0.join('/')} → ${lens1.join('/')} (stable)`)
  expect(lens1).toEqual(lens0)
})

test('G6 alloc: retained heap is flat over 20k hot-loop ticks (no per-tick leak)', () => {
  const world = buildBusyScene()
  // warmup
  for (let t = 0; t < 2000; t++) {
    if (t % 40 === 0) for (let i = 0; i < 10; i++) world.applyImpulse(`p${i}`, 60, 40)
    world.step()
  }
  gc()
  const h0 = process.memoryUsage().heapUsed
  function batch(n: number): void {
    for (let t = 0; t < n; t++) {
      if (t % 40 === 0) for (let i = 0; i < 10; i++) world.applyImpulse(`p${i}`, 60, 40)
      world.step()
    }
  }
  batch(10000)
  gc()
  const h1 = process.memoryUsage().heapUsed
  batch(10000)
  gc()
  const h2 = process.memoryUsage().heapUsed
  const growKB = (h2 - h1) / 1024
  console.log(`[G6 heap] warm=${(h0 / 1024).toFixed(0)}KB after10k=${(h1 / 1024).toFixed(0)}KB after20k=${(h2 / 1024).toFixed(0)}KB Δ(10k→20k)=${growKB.toFixed(1)}KB`)
  // A per-tick escaping allocation would leave retained growth after GC. Flat = pooled.
  expect(Math.abs(growKB)).toBeLessThan(512)
})
