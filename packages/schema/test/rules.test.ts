import { test, expect } from 'bun:test'
import { tryValidateRuleTable, tryValidateWorldV2, WORLD_RESPONSE_KINDS } from '../src/index'

// ── RuleTable validation: closed component set + closed response set (6b) ──────────
test('a valid seed-style rule table validates', () => {
  const r = tryValidateRuleTable({
    rows: [
      { a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', width: 20 }] },
      { a: 'locomotion', b: 'surface', event: 'blocked', responses: [{ kind: 'emitEvent', event: 'blocked' }] },
      { a: 'locomotion', b: 'disturbable', event: 'contact', responses: [{ kind: 'impulse', vec: [0, 200] }] },
      { a: 'locomotion', b: 'surface', event: 'landed', responses: [{ kind: 'support' }] },
    ],
  })
  expect(r.ok).toBe(true)
})

test('a component kind outside the closed set is rejected', () => {
  const r = tryValidateRuleTable({ rows: [{ a: 'wings', b: 'damageable', event: 'hit', responses: [] }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('component kind'))).toBe(true)
})

test('a response kind outside the closed world-response set is rejected', () => {
  const r = tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'teleport' }] }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes(WORLD_RESPONSE_KINDS.join(', ')))).toBe(true)
})

test('cut/impulse response fields are shape-checked', () => {
  expect(tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', edge: 'nope' }] }] }).ok).toBe(false)
  expect(tryValidateRuleTable({ rows: [{ a: 'locomotion', b: 'disturbable', event: 'c', responses: [{ kind: 'impulse', vec: [1] }] }] }).ok).toBe(false)
})

// ── damageable schema fields (healAfterMs / persistScope) ──────────────────────────
const wrapDamageable = (dmg: unknown) => ({ schemaVersion: 2, seed: 1, entities: [{ id: 'e', components: { damageable: dmg } }] })

test('damageable accepts the new 6b heal-policy fields', () => {
  expect(tryValidateWorldV2(wrapDamageable({ hp: 3, healAfterMs: 1200, persistScope: 'session' })).ok).toBe(true)
})

test('damageable rejects a bad persistScope, still rejects unknown fields', () => {
  expect(tryValidateWorldV2(wrapDamageable({ persistScope: 'forever' })).ok).toBe(false)
  const r = tryValidateWorldV2(wrapDamageable({ armor: 2 }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('damageable.armor'))).toBe(true)
})

// ── ITEM 8 regressions: closed schema + numeric constraints ────────────────────────

test('unknown fields on a RuleRow are rejected (closed schema)', () => {
  const r = tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [], when: 'always' }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('.when: unknown field'))).toBe(true)
})

test('unknown fields on a WorldResponse are rejected (closed schema, per kind)', () => {
  const cut = tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', depth: 3 }] }] })
  expect(cut.ok).toBe(false)
  if (!cut.ok) expect(cut.errors.some((e) => e.includes('.depth: unknown field'))).toBe(true)
  const sup = tryValidateRuleTable({ rows: [{ a: 'locomotion', b: 'surface', event: 'landed', responses: [{ kind: 'support', strength: 1 }] }] })
  expect(sup.ok).toBe(false)
})

test('cut response: width must be > 0, healAfterMs must be >= 0', () => {
  expect(tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', width: 0 }] }] }).ok).toBe(false)
  expect(tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', width: -8 }] }] }).ok).toBe(false)
  expect(tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', healAfterMs: -1 }] }] }).ok).toBe(false)
  expect(tryValidateRuleTable({ rows: [{ a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut', width: 8, healAfterMs: 0 }] }] }).ok).toBe(true)
})

test('damageable component: negative healAfterMs is rejected', () => {
  expect(tryValidateWorldV2(wrapDamageable({ healAfterMs: -100 })).ok).toBe(false)
  expect(tryValidateWorldV2(wrapDamageable({ healAfterMs: 0 })).ok).toBe(true)
})

// ── Phase 7b: the `intent` response (RuleRow responses may be full intents) ────────
test('7b: an `intent` response carrying a valid intent is accepted', () => {
  const r = tryValidateRuleTable({
    rows: [{ a: 'locomotion', b: 'surface', event: 'blocked', responses: [{ kind: 'intent', do: { verb: 'say', text: 'ow' } }] }],
  })
  expect(r.ok).toBe(true)
})

test('7b: an `intent` response with an invalid inner intent is rejected', () => {
  const bad = tryValidateRuleTable({
    rows: [{ a: 'locomotion', b: 'surface', event: 'blocked', responses: [{ kind: 'intent', do: { verb: 'teleport' } }] }],
  })
  expect(bad.ok).toBe(false)
  const badField = tryValidateRuleTable({
    rows: [{ a: 'locomotion', b: 'surface', event: 'blocked', responses: [{ kind: 'intent', do: { verb: 'say', text: 'x', bogus: 1 } }] }],
  })
  expect(badField.ok).toBe(false)
})
