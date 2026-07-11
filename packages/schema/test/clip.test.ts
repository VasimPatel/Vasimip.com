import { test, expect } from 'bun:test'
import {
  tryValidateClip,
  validateClipAgainstRig,
  clipWarnings,
  clipDuration,
  type Clip,
  type RigTemplate,
} from '../src/index'

const rig: RigTemplate = {
  id: 'r',
  joints: [
    { id: 'root', parentId: null, length: 10 },
    { id: 'mid', parentId: 'root', length: 8 },
  ],
  chains: [],
  secondarySlots: [],
}

const good: Clip = {
  id: 'c',
  loop: true,
  tracks: [
    { jointId: 'root', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 500, angle: 1, ease: 'easeInOut' }, { t: 1000, angle: 0, ease: 'easeInOut' }] },
    { jointId: 'mid', keys: [{ t: 0, angle: 0.2, ease: 'linear' }, { t: 1000, angle: 0.2, ease: 'linear' }] },
  ],
  markers: [{ t: 500, event: 'mid' }],
}

test('a well-formed clip validates and reports its duration', () => {
  const r = tryValidateClip(good)
  expect(r.ok).toBe(true)
  expect(clipDuration(good)).toBe(1000)
})

test('validateClipAgainstRig: unknown joint rejected', () => {
  const r = validateClipAgainstRig(
    { id: 'c', tracks: [{ jointId: 'ghost', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 100, angle: 1, ease: 'linear' }] }] },
    rig,
  )
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('ghost') && e.includes('unknown joint'))).toBe(true)
})

test('validateClipAgainstRig: all-known joints pass', () => {
  expect(validateClipAgainstRig(good, rig).ok).toBe(true)
})

test('clip: negative t rejected', () => {
  const r = tryValidateClip({ ...good, tracks: [{ jointId: 'root', keys: [{ t: -1, angle: 0, ease: 'linear' }] }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('>= 0'))).toBe(true)
})

test('clip: unsorted keys rejected', () => {
  const r = tryValidateClip({ ...good, tracks: [{ jointId: 'root', keys: [{ t: 500, angle: 0, ease: 'linear' }, { t: 100, angle: 1, ease: 'linear' }] }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('strictly increasing'))).toBe(true)
})

test('clip: duplicate t rejected', () => {
  const r = tryValidateClip({ ...good, tracks: [{ jointId: 'root', keys: [{ t: 100, angle: 0, ease: 'linear' }, { t: 100, angle: 1, ease: 'linear' }] }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('strictly increasing'))).toBe(true)
})

test('clip: unknown ease preset rejected (closed set)', () => {
  const r = tryValidateClip({ ...good, tracks: [{ jointId: 'root', keys: [{ t: 0, angle: 0, ease: 'boing' }] }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('ease'))).toBe(true)
})

test('clip: marker beyond duration rejected', () => {
  const r = tryValidateClip({ ...good, markers: [{ t: 5000, event: 'late' }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('within clip duration'))).toBe(true)
})

test('clip: empty tracks rejected', () => {
  const r = tryValidateClip({ id: 'c', tracks: [] })
  expect(r.ok).toBe(false)
})

test('clip: rootTrack validated (x/y/rot required, sorted)', () => {
  const r = tryValidateClip({
    ...good,
    rootTrack: { keys: [{ t: 0, x: 0, y: 0, rot: 0, ease: 'linear' }, { t: 1000, x: 1, y: 2, rot: 0.1, ease: 'easeOut' }] },
  })
  expect(r.ok).toBe(true)
})

test('clipWarnings: loop endpoint mismatch is warning-level (not an error)', () => {
  const mismatched: Clip = {
    id: 'c',
    loop: true,
    tracks: [{ jointId: 'root', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 1000, angle: 1, ease: 'linear' }] }],
  }
  expect(tryValidateClip(mismatched).ok).toBe(true) // still valid…
  const w = clipWarnings(mismatched)
  expect(w.length).toBeGreaterThan(0) // …but flagged
  expect(w[0]).toContain('wrap will pop')
})

test('clipWarnings: matched loop endpoints produce no warning; non-loop never warns', () => {
  expect(clipWarnings(good)).toHaveLength(0)
  expect(clipWarnings({ ...good, loop: false })).toHaveLength(0)
})

test('clip: t=0 marker on a NON-loop clip is an error (would never fire)', () => {
  const r = tryValidateClip({ ...good, loop: false, markers: [{ t: 0, event: 'start' }] })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.some((e) => e.includes('never fire') && e.includes('t > 0'))).toBe(true)
})

test('clip: t=0 marker on a LOOP clip is valid but warns about lap-completion semantics', () => {
  const withT0: Clip = { ...good, loop: true, markers: [{ t: 0, event: 'lap' }] }
  expect(tryValidateClip(withT0).ok).toBe(true) // valid…
  const w = clipWarnings(withT0)
  expect(w.some((s) => s.includes('LAP COMPLETION'))).toBe(true) // …but flagged
})
