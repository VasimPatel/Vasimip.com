import { test, expect } from 'bun:test'
import {
  tryValidateRig,
  tryValidatePose,
  validatePoseAgainstRig,
  tryValidateCharacter,
  type RigTemplate,
} from '../src/index'

const goodRig: RigTemplate = {
  id: 'r',
  joints: [
    { id: 'root', parentId: null, length: 10 },
    { id: 'mid', parentId: 'root', length: 8, attach: 'origin' },
    { id: 'tip', parentId: 'mid', length: 6 },
  ],
  chains: [{ id: 'c', jointIds: ['root', 'mid', 'tip'] }],
  secondarySlots: ['tip'],
}

// ── rig validation ─────────────────────────────────────────────────────────────

test('a well-formed rig validates', () => {
  expect(tryValidateRig(goodRig).ok).toBe(true)
})

test('rig: duplicate joint ids rejected', () => {
  const r = tryValidateRig({ ...goodRig, joints: [
    { id: 'root', parentId: null, length: 10 },
    { id: 'root', parentId: 'root', length: 8 },
  ] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('duplicate'))).toBe(true)
})

test('rig: unknown parent (orphan) rejected', () => {
  const r = tryValidateRig({ ...goodRig, joints: [
    { id: 'root', parentId: null, length: 10 },
    { id: 'a', parentId: 'ghost', length: 8 },
  ] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('unknown parent'))).toBe(true)
})

test('rig: more than one root rejected', () => {
  const r = tryValidateRig({ ...goodRig, joints: [
    { id: 'a', parentId: null, length: 10 },
    { id: 'b', parentId: null, length: 8 },
  ] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('root'))).toBe(true)
})

test('rig: cycle rejected', () => {
  // Two joints referencing each other → no root AND a cycle.
  const r = tryValidateRig({ ...goodRig, joints: [
    { id: 'a', parentId: 'b', length: 10 },
    { id: 'b', parentId: 'a', length: 8 },
  ] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('cycle'))).toBe(true)
})

test('rig: invalid attach value rejected', () => {
  const r = tryValidateRig({ ...goodRig, joints: [{ id: 'root', parentId: null, length: 10, attach: 'middle' }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('attach'))).toBe(true)
})

// ── pose validation ─────────────────────────────────────────────────────────────

test('a structural pose validates', () => {
  expect(tryValidatePose({ id: 'p', angles: { root: 0.1 }, root: { x: 0, y: 0, rot: 0 } }).ok).toBe(true)
})

test('pose: non-finite angle rejected', () => {
  const r = tryValidatePose({ id: 'p', angles: { root: Number.POSITIVE_INFINITY } })
  expect(r.ok).toBe(false)
})

test('pose vs rig: angle referencing unknown joint rejected', () => {
  const r = validatePoseAgainstRig({ id: 'p', angles: { root: 0, ghost: 1 } }, goodRig)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('ghost') && e.includes('unknown joint'))).toBe(true)
})

test('pose vs rig: all-known angles pass', () => {
  expect(validatePoseAgainstRig({ id: 'p', angles: { root: 0, mid: 0.2 } }, goodRig).ok).toBe(true)
})

// ── character validation ─────────────────────────────────────────────────────────

const goodChar = {
  id: 'dash',
  rig: 'dash',
  style: { color: '#1a1a1a', width: 5, linecap: 'round' },
  personality: { energy: 0.8, bounciness: 0.85, confidence: 0.8, sloppiness: 0.3 },
  locomotion: { modes: ['walk', 'hop', 'fly'], maxJumpHeight: 120 },
}

test('a well-formed character validates', () => {
  expect(tryValidateCharacter(goodChar).ok).toBe(true)
})

test('character: personality out of 0..1 rejected', () => {
  const r = tryValidateCharacter({ ...goodChar, personality: { ...goodChar.personality, energy: 1.5 } })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('personality.energy'))).toBe(true)
})

test('character: missing personality rejected', () => {
  const { personality, ...rest } = goodChar
  void personality
  expect(tryValidateCharacter(rest).ok).toBe(false)
})

test('character: bad locomotion mode rejected', () => {
  const r = tryValidateCharacter({ ...goodChar, locomotion: { modes: ['teleport'] } })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('locomotion.modes'))).toBe(true)
})
