import { test, expect } from 'bun:test'
import { createSim, type Input } from '../src/index'
import type { WorldDocV2 } from '@dash/schema'

function makeWorld(): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1337,
    entities: [
      { id: 'dash', x: 0, y: 0 },
      { id: 'pip', x: 5, y: -3 },
      { id: 'ball', x: -8, y: 2 },
      { id: 'crate', x: 12, y: 7 },
    ],
  }
}

const INPUTS: { tick: number; input: Input }[] = [
  { tick: 100, input: { kind: 'impulse', entityId: 'dash', vec: [3, -1] } },
  { tick: 2500, input: { kind: 'impulse', entityId: 'pip', vec: [-2, 4] } },
  { tick: 5000, input: { kind: 'impulse', entityId: 'ball', vec: [1, 1] } },
  { tick: 7777, input: { kind: 'impulse', entityId: 'crate', vec: [-5, 0] } },
]

function run(): { hash: string; traceLen: number } {
  const sim = createSim(makeWorld())
  for (const { tick, input } of INPUTS) sim.scheduleInput(tick, input)
  sim.step(10_000)
  return { hash: sim.hash(), traceLen: sim.trace().length }
}

test('THE GATE: replay identity — seed 1337, scripted inputs, 10k ticks, run twice → identical', () => {
  const a = run()
  const b = run()
  // Printed so the gate hash is visible in the test log (see final report).
  console.log(`[replay gate] run A: hash=${a.hash} traceLen=${a.traceLen}`)
  console.log(`[replay gate] run B: hash=${b.hash} traceLen=${b.traceLen}`)
  expect(a.hash).toBe(b.hash)
  expect(a.traceLen).toBe(b.traceLen)
})
