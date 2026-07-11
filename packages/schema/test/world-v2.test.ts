import { test, expect } from 'bun:test'
import { tryValidateWorldV2 } from '../src/index'

const wrap = (components: Record<string, unknown>) => ({
  schemaVersion: 2,
  seed: 7,
  entities: [{ id: 'e', components }],
})

test('closed set: an unknown component name is rejected', () => {
  const r = tryValidateWorldV2(wrap({ wings: {} }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('unknown component'))).toBe(true)
})

test('real components validate structurally', () => {
  const ok = tryValidateWorldV2(wrap({
    transform: { x: 1, y: 2, rot: 0.1 },
    surface: { box: { x: 0, y: 0, w: 10, h: 10 }, anchor: { dx: 5, dy: 0 } },
    collidable: { shape: 'segments', segments: [{ x1: 0, y1: 0, x2: 10, y2: 0 }] },
    rigInstance: { character: 'dash' },
    locomotion: { character: 'dash', caps: { modes: ['walk', 'hop'], maxJumpHeight: 100, maxJumpDistance: 200 } },
  }))
  expect(ok.ok).toBe(true)
})

test('transform rejects unknown fields (closed schema)', () => {
  const r = tryValidateWorldV2(wrap({ transform: { x: 0, y: 0, z: 3 } }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('transform.z'))).toBe(true)
})

test('collidable dispatches per-shape and rejects a bad shape', () => {
  expect(tryValidateWorldV2(wrap({ collidable: { shape: 'capsule', x0: 0, y0: 0, x1: 0, y1: 10, r: 6 } })).ok).toBe(true)
  expect(tryValidateWorldV2(wrap({ collidable: { shape: 'aabb', x: 0, y: 0, w: 5, h: 5 } })).ok).toBe(true)
  const bad = tryValidateWorldV2(wrap({ collidable: { shape: 'sphere' } }))
  expect(bad.ok).toBe(false)
})

test('stubs accept only their reserved fields', () => {
  expect(tryValidateWorldV2(wrap({ damageable: {}, disturbable: { mass: 2 } })).ok).toBe(true)
  const r = tryValidateWorldV2(wrap({ damageable: { hp: 3, armor: 9 } }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('damageable.armor'))).toBe(true)
})

test('meta is opaque render-layer — never validated', () => {
  const r = tryValidateWorldV2({
    schemaVersion: 2,
    seed: 1,
    entities: [{ id: 'panel', components: { surface: { box: { x: 0, y: 0, w: 1, h: 1 }, anchor: { dx: 0, dy: 0 } } }, meta: { boxes: [{ anything: true }], nested: [1, 2, 3] } }],
  })
  expect(r.ok).toBe(true)
})

test('an unknown top-level entity field is rejected', () => {
  const r = tryValidateWorldV2({ schemaVersion: 2, seed: 1, entities: [{ id: 'e', components: {}, x: 5 }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('.x'))).toBe(true)
})
