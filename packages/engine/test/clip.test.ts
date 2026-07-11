import { test, expect } from 'bun:test'
import { sampleClip, markersCrossed, easeValue, clipDuration, createClipPlayer } from '../src/clip'
import type { Clip } from '@dash/schema'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)

// ── ease presets ────────────────────────────────────────────────────────────
test('ease presets: endpoints, midpoints, monotonicity', () => {
  for (const p of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
    near(easeValue(p, 0), 0)
    near(easeValue(p, 1), 1)
  }
  near(easeValue('linear', 0.5), 0.5)
  near(easeValue('easeIn', 0.5), 0.125) // 0.5^3
  near(easeValue('easeOut', 0.5), 0.875) // 1 - 0.5^3
  near(easeValue('easeInOut', 0.5), 0.5)
  near(easeValue('easeInOut', 0.25), 4 * 0.25 ** 3) // 0.0625
  // easeIn slow-start: below linear on first half
  expect(easeValue('easeIn', 0.3)).toBeLessThan(0.3)
  // easeOut fast-start: above linear on first half
  expect(easeValue('easeOut', 0.3)).toBeGreaterThan(0.3)
  // hold: step at end
  near(easeValue('hold', 0), 0)
  near(easeValue('hold', 0.99), 0)
  near(easeValue('hold', 1), 1)
})

// ── sampling / segment lookup ────────────────────────────────────────────────
const clip: Clip = {
  id: 't',
  tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 100, angle: 1, ease: 'linear' }, { t: 200, angle: 0, ease: 'linear' }] }],
}

test('linear interpolation picks the right segment', () => {
  near(sampleClip(clip, 0).angles.j, 0)
  near(sampleClip(clip, 50).angles.j, 0.5)
  near(sampleClip(clip, 100).angles.j, 1)
  near(sampleClip(clip, 150).angles.j, 0.5)
  near(sampleClip(clip, 200).angles.j, 0)
})

test('before first key clamps to first; after last clamps to last (one-shot)', () => {
  near(sampleClip(clip, -50).angles.j, 0)
  near(sampleClip(clip, 999).angles.j, 0)
})

test('ease applies to the segment ENDING at the key', () => {
  const c: Clip = { id: 'e', tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 100, angle: 1, ease: 'easeIn' }] }] }
  // at u=0.5 the ending key's easeIn → 0.125
  near(sampleClip(c, 50).angles.j, 0.125)
})

test('shortest-arc interpolation across ±π (no long-way spin)', () => {
  // 3.0 → -3.0 shortest arc crosses +π (≈ +0.283 rad total), not the -6 long way.
  const c: Clip = { id: 'a', tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 3.0, ease: 'linear' }, { t: 100, angle: -3.0, ease: 'linear' }] }] }
  const mid = sampleClip(c, 50).angles.j
  // midpoint should be near ±π (magnitude close to π), NOT near 0.
  expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.2)
})

test('loop wrap: time modulo duration', () => {
  const c: Clip = { id: 'l', loop: true, tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 100, angle: 1, ease: 'linear' }, { t: 200, angle: 0, ease: 'linear' }] }] }
  expect(clipDuration(c)).toBe(200)
  near(sampleClip(c, 250).angles.j, sampleClip(c, 50).angles.j) // 250 % 200 = 50
  near(sampleClip(c, 200).angles.j, 0) // wraps to 0
  near(sampleClip(c, -50).angles.j, sampleClip(c, 150).angles.j) // negative wraps
})

test('rootTrack sampled: x/y linear, rot shortest-arc', () => {
  const c: Clip = {
    id: 'r',
    tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 100, angle: 0, ease: 'linear' }] }],
    rootTrack: { keys: [{ t: 0, x: 0, y: 0, rot: 0, ease: 'linear' }, { t: 100, x: 10, y: -4, rot: 1, ease: 'linear' }] },
  }
  const s = sampleClip(c, 50)
  near(s.root!.x, 5)
  near(s.root!.y, -2)
  near(s.root!.rot, 0.5)
})

// ── markers ───────────────────────────────────────────────────────────────────
const mclip: Clip = {
  id: 'm',
  tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 300, angle: 1, ease: 'linear' }] }],
  markers: [{ t: 100, event: 'a' }, { t: 200, event: 'b' }],
}

test('markersCrossed: fires within half-open interval, exact boundary once', () => {
  expect(markersCrossed(mclip, 90, 100)).toEqual(['a']) // upper bound reaches 100 → fire
  expect(markersCrossed(mclip, 100, 110)).toEqual([]) // prev == 100 → no double fire
  expect(markersCrossed(mclip, 0, 250)).toEqual(['a', 'b']) // both, chronological
  expect(markersCrossed(mclip, 210, 300)).toEqual([]) // none left
})

test('markersCrossed: loop-aware, refires each lap incl. wrap straddle', () => {
  const lc: Clip = { ...mclip, loop: true } // duration 300
  // one tick straddling the wrap from 290→310 should fire nothing (no marker in (290,310] mod)…
  expect(markersCrossed(lc, 290, 310)).toEqual([])
  // …but crossing 400 (=100 of lap 2) fires 'a' again
  expect(markersCrossed(lc, 390, 400)).toEqual(['a'])
  // a wide interval spanning a full lap fires each marker once per lap, ordered
  expect(markersCrossed(lc, 0, 600)).toEqual(['a', 'b', 'a', 'b'])
})

test('createClipPlayer advances playhead and reports markers per step', () => {
  const p = createClipPlayer(mclip)
  const r1 = p.advance(100)
  expect(r1.markers).toEqual(['a'])
  expect(p.timeMs).toBe(100)
  const r2 = p.advance(100)
  expect(r2.markers).toEqual(['b'])
  // state round-trip
  const st = p.getState()
  const q = createClipPlayer(mclip)
  q.setState(st)
  expect(q.timeMs).toBe(200)
})

test('t=0 marker: never fires on a one-shot; fires at each lap COMPLETION on a loop', () => {
  const oneShot: Clip = {
    id: 'z',
    tracks: [{ jointId: 'j', keys: [{ t: 0, angle: 0, ease: 'linear' }, { t: 300, angle: 1, ease: 'linear' }] }],
    markers: [{ t: 0, event: 'start' }],
  }
  // playback starts AT 0 — the (prev, t] interval never contains 0
  expect(markersCrossed(oneShot, 0, 100)).toEqual([])
  expect(markersCrossed(oneShot, 0, 10_000)).toEqual([])

  const loop: Clip = { ...oneShot, loop: true } // duration 300
  expect(markersCrossed(loop, 0, 299)).toEqual([]) // not during the first lap…
  expect(markersCrossed(loop, 290, 300)).toEqual(['start']) // …fires exactly at lap completion
  expect(markersCrossed(loop, 300, 310)).toEqual([]) // no double fire
  expect(markersCrossed(loop, 0, 900)).toEqual(['start', 'start', 'start']) // once per lap
})

test('ClipPlayer.setState throws on clip id mismatch', () => {
  const p = createClipPlayer(mclip)
  p.advance(50)
  const other = createClipPlayer({ id: 'other', tracks: mclip.tracks })
  expect(() => other.setState(p.getState())).toThrow(/mismatch/)
  // same-id state still restores fine
  const q = createClipPlayer(mclip)
  q.setState(p.getState())
  expect(q.timeMs).toBe(50)
})
