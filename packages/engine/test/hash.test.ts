import { test, expect } from 'bun:test'
import { hashState, serializeState } from '../src/index'

/** The next representable f64 above x (exactly 1 ulp up), via bit manipulation. */
function ulpUp(x: number): number {
  const dv = new DataView(new ArrayBuffer(8))
  dv.setFloat64(0, x)
  dv.setBigUint64(0, dv.getBigUint64(0) + 1n)
  return dv.getFloat64(0)
}

test('identical states → identical hash', () => {
  const a = { entities: [{ id: 'x', x: 1.5, y: -2.25 }], tick: 10 }
  const b = { entities: [{ id: 'x', x: 1.5, y: -2.25 }], tick: 10 }
  expect(hashState(a)).toBe(hashState(b))
})

test('key order does not matter', () => {
  expect(hashState({ a: 1, b: 2, c: 'z' })).toBe(hashState({ c: 'z', b: 2, a: 1 }))
})

test('a 1-ulp float difference → different hash', () => {
  const x = 0.1
  const y = ulpUp(x)
  expect(y).not.toBe(x)
  expect(hashState({ v: x })).not.toBe(hashState({ v: y }))
})

test('+0 and -0 hash identically (documented: -0 collapses to +0)', () => {
  expect(hashState({ v: 0 })).toBe(hashState({ v: -0 }))
})

test('all NaNs hash identically and stably (documented: NaN → single pattern)', () => {
  expect(hashState({ v: NaN })).toBe(hashState({ v: NaN }))
  expect(hashState({ v: NaN })).toBe(hashState({ v: 0 / 0 }))
  expect(hashState({ v: NaN })).not.toBe(hashState({ v: 0 }))
})

test('digest is a stable 16-hex-char string', () => {
  expect(hashState({ v: 3.14159 })).toMatch(/^[0-9a-f]{16}$/)
})

test('serializeState is canonical (recursively sorted keys)', () => {
  expect(serializeState({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  expect(serializeState({ a: 2, b: 1 })).toBe('{"a":2,"b":1}')
  expect(serializeState({ z: { d: 1, c: 2 } })).toBe('{"z":{"c":2,"d":1}}')
})
