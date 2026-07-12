// Phase 7a gate — BehaviorDoc schema: closed verb set, TargetRef grammar, the
// reaction/cue/when TYPED surface, gate evaluation, and the dry world check. Pairs
// with the engine's behavior.verbs gate (execution) — this gate is validation only.
import { test, expect } from 'bun:test'
import {
  tryValidateBehavior,
  validateBehaviorAgainstWorld,
  parseTargetRef,
  evalGate,
  type BehaviorDoc,
  type GateExpr,
} from '../src/index'

// ── valid docs across a spread of verbs ─────────────────────────────────────────
test('a BehaviorDoc spanning many verbs validates', () => {
  const doc = {
    schemaVersion: 2,
    id: 'spread',
    steps: [
      { verb: 'idle' },
      { verb: 'moveTo', target: 'entity:pip' },
      { verb: 'jumpTo', target: 'panel:p0#roof', timeoutMs: 3000 },
      { verb: 'flyTo', target: 'node:panel:0:2:roofL' },
      { verb: 'flyThrough', target: 'nearest:surface' },
      { verb: 'playClip', ref: 'walk-cycle', blendMs: 120 },
      { verb: 'strikePose', ref: 'cheer', holdMs: 400 },
      { verb: 'say', text: 'hi' },
      { verb: 'sfx', kind: 'thud' },
      { verb: 'camera', to: 'entity:pip', ms: 500 },
      { verb: 'wait', ms: 100 },
      { verb: 'emit', emitter: 'sparkle', count: 3 },
      { verb: 'impulse', target: 'crate', vec: [100, 0] },
      { verb: 'attach', target: 'hat', point: 'head' },
      { verb: 'detach', target: 'hat' },
      { verb: 'setFlag', flag: 'greeted', value: true },
    ],
  }
  const r = tryValidateBehavior(doc)
  expect(r.ok).toBe(true)
})

// ── closed schema rejections ─────────────────────────────────────────────────────
test('a closed-verb violation (teleport) is rejected', () => {
  const r = tryValidateBehavior({ schemaVersion: 2, id: 'x', steps: [{ verb: 'teleport' }] })
  expect(r.ok).toBe(false)
})

test('an unknown field on a valid verb is rejected (closed schema)', () => {
  const r = tryValidateBehavior({ schemaVersion: 2, id: 'x', steps: [{ verb: 'moveTo', target: 'entity:x', bogus: 1 }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('unknown field'))).toBe(true)
})

test('schemaVersion !== 2 is rejected', () => {
  const r = tryValidateBehavior({ schemaVersion: 1, id: 'x', steps: [] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('schemaVersion'))).toBe(true)
})

// ── TargetRef grammar ────────────────────────────────────────────────────────────
test('parseTargetRef parses each valid grammar into its typed kind', () => {
  expect(parseTargetRef('panel:p0#roof')).toEqual({ kind: 'panelSpot', panel: 'p0', spot: 'roof' })
  expect(parseTargetRef('panel:p0#interior')).toEqual({ kind: 'panelSpot', panel: 'p0', spot: 'interior' })
  expect(parseTargetRef('entity:pip')).toEqual({ kind: 'entity', entity: 'pip' })
  expect(parseTargetRef('nearest:surface')).toEqual({ kind: 'nearestSurface' })
  expect(parseTargetRef('node:panel:0:2:roofL')).toEqual({ kind: 'node', node: 'panel:0:2:roofL' })
})

test('parseTargetRef returns null for bad grammar', () => {
  expect(parseTargetRef('panel:p0#middle')).toBeNull() // bad spot
  expect(parseTargetRef('garbage')).toBeNull()
  expect(parseTargetRef('entity:')).toBeNull()
  expect(parseTargetRef('')).toBeNull()
})

test('a moveTo with a bad target string is rejected by the validator', () => {
  const r = tryValidateBehavior({ schemaVersion: 2, id: 'x', steps: [{ verb: 'moveTo', target: 'panel:p0#middle' }] })
  expect(r.ok).toBe(false)
})

// ── reactions / cues / when TYPED surface ────────────────────────────────────────
test('a doc with reactions, cues and a when-gate validates', () => {
  const doc = {
    schemaVersion: 2,
    id: 'typed',
    steps: [{ verb: 'idle' }],
    reactions: { onBlocked: [{ verb: 'say', text: 'ow' }] },
    cues: [{ at: 'onLand', do: { verb: 'sfx', kind: 'thud' } }],
    when: { and: [{ flag: 'a' }, { not: { flag: 'b' } }] },
  }
  const r = tryValidateBehavior(doc)
  expect(r.ok).toBe(true)
})

test('an unknown reaction trigger is rejected', () => {
  const r = tryValidateBehavior({ schemaVersion: 2, id: 'x', steps: [], reactions: { onBogus: [{ verb: 'idle' }] } })
  expect(r.ok).toBe(false)
})

test('an unknown cue milestone is rejected', () => {
  const r = tryValidateBehavior({ schemaVersion: 2, id: 'x', steps: [], cues: [{ at: 'onBogus', do: { verb: 'idle' } }] })
  expect(r.ok).toBe(false)
})

test('a malformed gate (multiple keys) is rejected', () => {
  const r = tryValidateBehavior({ schemaVersion: 2, id: 'x', steps: [], when: { flag: 'a', not: { flag: 'b' } } })
  expect(r.ok).toBe(false)
})

// ── branchOnFlag TYPE (execution is 7b) ──────────────────────────────────────────
test('a nested branchOnFlag doc validates (then/else recurse)', () => {
  const doc = {
    schemaVersion: 2,
    id: 'branch',
    steps: [
      {
        verb: 'branchOnFlag',
        flag: 'happy',
        then: [{ verb: 'strikePose', ref: 'cheer' }],
        else: [{ verb: 'say', text: 'meh' }],
      },
    ],
  }
  expect(tryValidateBehavior(doc).ok).toBe(true)
})

// ── evalGate ─────────────────────────────────────────────────────────────────────
test('evalGate evaluates and / or / not against a flag store', () => {
  const and: GateExpr = { and: [{ flag: 'a' }, { flag: 'b' }] }
  expect(evalGate(and, { a: true, b: false })).toBe(false)
  expect(evalGate(and, { a: true, b: true })).toBe(true)
  const or: GateExpr = { or: [{ flag: 'a' }, { flag: 'b' }] }
  expect(evalGate(or, { a: true, b: false })).toBe(true)
  expect(evalGate({ not: { flag: 'a' } }, { a: false })).toBe(true)
  expect(evalGate({ not: { flag: 'a' } }, { a: true })).toBe(false)
})

// ── validateBehaviorAgainstWorld ─────────────────────────────────────────────────
test('validateBehaviorAgainstWorld fails a panel target not present in the world', () => {
  const doc: BehaviorDoc = { schemaVersion: 2, id: 'x', steps: [{ verb: 'moveTo', target: 'panel:nope#roof' }] }
  const r = validateBehaviorAgainstWorld(doc, { entityIds: new Set(['panel:yes']) })
  expect(r.ok).toBe(false)
})

test('validateBehaviorAgainstWorld passes when the target entity exists', () => {
  const doc: BehaviorDoc = { schemaVersion: 2, id: 'x', steps: [{ verb: 'moveTo', target: 'entity:pip' }] }
  const r = validateBehaviorAgainstWorld(doc, { entityIds: new Set(['pip']) })
  expect(r.ok).toBe(true)
})
