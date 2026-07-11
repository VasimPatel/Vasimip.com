import { test, expect } from 'bun:test'
import { tryValidateWorldV2, migrateToCurrent, CURRENT_SCHEMA_VERSION } from '../src/index'

test('a valid WorldDocV2 passes', () => {
  const r = tryValidateWorldV2({ schemaVersion: 2, seed: 1, entities: [{ id: 'a', x: 0, y: 0 }] })
  expect(r.ok).toBe(true)
})

test('collects ALL problems as `path: message` strings (legacy ergonomics)', () => {
  const r = tryValidateWorldV2({ schemaVersion: 1, seed: 'nope', entities: [{ id: '', x: 'a', y: 0 }] })
  expect(r.ok).toBe(false)
  if (!r.ok) {
    expect(r.errors.length).toBeGreaterThan(1)
    for (const e of r.errors) expect(e).toContain(':')
  }
})

test('duplicate entity ids are flagged', () => {
  const r = tryValidateWorldV2({ schemaVersion: 2, seed: 1, entities: [{ id: 'a', x: 0, y: 0 }, { id: 'a', x: 1, y: 1 }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('duplicate'))).toBe(true)
})

test('non-object → single doc-level error', () => {
  expect(tryValidateWorldV2(42)).toEqual({ ok: false, errors: ['doc: must be an object'] })
})

test('migrateToCurrent is a no-op for a current-version doc', () => {
  const doc = { schemaVersion: CURRENT_SCHEMA_VERSION, seed: 1, entities: [] }
  const { doc: out, applied } = migrateToCurrent(doc)
  expect(applied).toEqual([])
  expect(out).toBe(doc)
})

test('migrateToCurrent throws when no migration is registered for an older version', () => {
  expect(() => migrateToCurrent({ schemaVersion: 1 })).toThrow()
})
