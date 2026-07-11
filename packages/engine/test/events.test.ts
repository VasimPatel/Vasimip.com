import { test, expect } from 'bun:test'
import { createEventBus } from '../src/index'

test('trace records tick + order of every emit', () => {
  let tick = 0
  const bus = createEventBus(() => tick)
  bus.emit('a', 1)
  tick = 5
  bus.emit('b', 2)
  bus.emit('a', 3)
  const tr = bus.trace()
  expect(tr.map((e) => e.type)).toEqual(['a', 'b', 'a'])
  expect(tr.map((e) => e.tick)).toEqual([0, 5, 5])
  expect(tr.map((e) => e.payload)).toEqual([1, 2, 3])
})

test('on() delivers payloads and unsubscribes; trace still records everything', () => {
  let tick = 0
  const bus = createEventBus(() => tick)
  const seen: unknown[] = []
  const off = bus.on('x', (p) => seen.push(p))
  bus.emit('x', 'a')
  off()
  bus.emit('x', 'b')
  expect(seen).toEqual(['a'])
  expect(bus.trace().length).toBe(2)
})
