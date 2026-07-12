// Phase 7a HARDENING — CharacterDoc locomotion-cap validation. The review found that
// a schema-valid-but-incoherent cap set (a zero/absurd flySpeed, a declared mode with
// no caps to run on) is a guaranteed RUNTIME WEDGE: a zero flySpeed "can fly" but
// never moves; a mode without its caps silently falls back to solver defaults the
// author never chose. These caps must be rejected at the SCHEMA boundary, before any
// runtime ever sees them. (Positive-cap / mode-coherence rules live in
// schema/src/character.ts checkLocomotion.)
import { test, expect } from 'bun:test'
import { tryValidateCharacter, type LocomotionCaps } from '../src/index'

/** A minimal, otherwise-valid CharacterDoc carrying the given locomotion caps. */
function withLocomotion(locomotion: unknown) {
  return {
    id: 'caps-fixture',
    rig: 'dash',
    personality: { energy: 0.5, bounciness: 0.5, confidence: 0.5, sloppiness: 0.5 },
    locomotion,
  }
}

/** The one coherent full cap set: every declared mode has the caps it runs on, and
 * every cap is inside (0, 5000]. This is exactly the committed Dash character's set. */
const COHERENT: LocomotionCaps = {
  modes: ['walk', 'hop', 'fly'],
  maxJumpHeight: 120,
  maxJumpDistance: 180,
  flySpeed: 220,
}

test('accepts the coherent full fixture (walk/hop/fly with 120 / 180 / 220)', () => {
  const r = tryValidateCharacter(withLocomotion(COHERENT))
  if (!r.ok) console.log(`[caps/coherent] UNEXPECTED errors: ${r.errors.join(' | ')}`)
  expect(r.ok).toBe(true)
})

test('rejects flySpeed 0 (validates as "can fly" but never moves — a wedge)', () => {
  const r = tryValidateCharacter(withLocomotion({ modes: ['walk', 'hop', 'fly'], maxJumpHeight: 120, maxJumpDistance: 180, flySpeed: 0 }))
  expect(r.ok).toBe(false)
  if (!r.ok) {
    console.log(`[caps/flySpeed0] errors=${JSON.stringify(r.errors)}`)
    expect(r.errors.some((e) => e.includes('flySpeed'))).toBe(true)
  }
})

test('rejects negative flySpeed (-5)', () => {
  const r = tryValidateCharacter(withLocomotion({ modes: ['walk', 'hop', 'fly'], maxJumpHeight: 120, maxJumpDistance: 180, flySpeed: -5 }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('flySpeed'))).toBe(true)
})

test('rejects an absurd flySpeed (9999 > cap 5000 — teleports past waypoints)', () => {
  const r = tryValidateCharacter(withLocomotion({ modes: ['walk', 'hop', 'fly'], maxJumpHeight: 120, maxJumpDistance: 180, flySpeed: 9999 }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('flySpeed'))).toBe(true)
})

test("rejects modes ['fly'] with flySpeed absent (declared mode, no cap to run on)", () => {
  const r = tryValidateCharacter(withLocomotion({ modes: ['fly'] }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('flySpeed'))).toBe(true)
})

test("rejects modes ['hop'] missing maxJumpHeight", () => {
  const r = tryValidateCharacter(withLocomotion({ modes: ['hop'], maxJumpDistance: 180 }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('maxJumpHeight') || e.includes('maxJumpDistance'))).toBe(true)
})

test("rejects modes ['hop'] missing maxJumpDistance", () => {
  const r = tryValidateCharacter(withLocomotion({ modes: ['hop'], maxJumpHeight: 120 }))
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('maxJumpHeight') || e.includes('maxJumpDistance'))).toBe(true)
})
