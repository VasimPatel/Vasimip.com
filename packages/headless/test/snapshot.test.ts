import { test, expect } from 'bun:test'
import { createSim, type Input } from '../src/index'
import { serializeState } from '@dash/engine'
import type { WorldDocV2 } from '@dash/schema'

const world: WorldDocV2 = {
  schemaVersion: 2,
  seed: 4242,
  entities: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 3, y: -2 },
    { id: 'c', x: -5, y: 1 },
  ],
}

const inputs: { tick: number; input: Input }[] = [
  { tick: 1000, input: { kind: 'impulse', entityId: 'a', vec: [2, 2] } },
  { tick: 6000, input: { kind: 'impulse', entityId: 'b', vec: [-3, 1] } },
]

test('snapshot/restore equivalence — serialize at 5000, restore fresh, both to 10000 → identical hash', () => {
  const A = createSim(world)
  for (const { tick, input } of inputs) A.scheduleInput(tick, input)
  A.step(5000)

  // Prove serializability is TOTAL: round-trip the snapshot through a canonical
  // string, then rebuild a sim from the parsed result.
  const snap = A.snapshot()
  const restored = JSON.parse(serializeState(snap)) as typeof snap

  A.step(5000)
  const hashA = A.hash()

  const B = createSim(world)
  B.restore(restored)
  B.step(5000)
  const hashB = B.hash()

  expect(hashB).toBe(hashA)
})
