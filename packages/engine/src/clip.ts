// Clip player (L1b) — pure, allocation-light sampling of a keyframed Clip.
//
// `sampleClip(clip, tMs)` returns the interpolated joint angles (+ optional root)
// at a time. Interpolation is piecewise between adjacent keys using the segment's
// ease preset (the ease of the key ENDING the segment — the authoring contract in
// packages/schema/src/clip.ts). Angle tracks interpolate along the SHORTEST ARC so
// a track that crosses ±π never spins the long way. Before the first key clamps to
// the first value; after the last, to the last value — or, for loop clips, time is
// wrapped modulo duration BEFORE sampling so playback is seamless.
//
// Markers are NOT emitted here (the player doesn't own a bus): `markersCrossed`
// reports which marker events fall in an interval so the caller can emit them on
// the engine bus stamped with the current tick.

import type { Clip, EasePreset, Pose, RootOffset } from '@dash/schema'
import { clipDuration } from '@dash/schema'
import { wrapPi, lerp } from './math'

export { clipDuration }

/** A sampled clip frame: local joint angles + optional root offset. Plain data. */
export interface ClipSample {
  angles: Record<string, number>
  root?: RootOffset
}

// ── easing (cubic-based; matches EasePreset) ────────────────────────────────────
// Each maps normalized segment progress u ∈ [0,1] → eased progress. 'hold' is the
// step-at-end: value stays at the segment START until the very end, then snaps.

function ease(preset: EasePreset, u: number): number {
  switch (preset) {
    case 'linear':
      return u
    case 'easeIn':
      return u * u * u
    case 'easeOut': {
      const inv = 1 - u
      return 1 - inv * inv * inv
    }
    case 'easeInOut':
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
    case 'hold':
      return u >= 1 ? 1 : 0
  }
}

/** Exposed for unit tests of the curve set. */
export function easeValue(preset: EasePreset, u: number): number {
  return ease(preset, u)
}

// ── sampling ────────────────────────────────────────────────────────────────

interface Keyed {
  t: number
  ease: EasePreset
}

/** Find segment index i such that keys[i-1].t <= t < keys[i].t; returns the eased
 * blend factor and the two bounding indices. Assumes keys sorted, length >= 1. */
function locate<K extends Keyed>(keys: K[], t: number): { a: number; b: number; f: number } {
  const n = keys.length
  if (t <= keys[0].t) return { a: 0, b: 0, f: 0 }
  const last = keys[n - 1]
  if (t >= last.t) return { a: n - 1, b: n - 1, f: 0 }
  // Linear scan (clips are short — a handful of keys); binary search not worth it.
  let i = 1
  while (i < n && keys[i].t <= t) i++
  const a = i - 1
  const b = i
  const span = keys[b].t - keys[a].t
  const u = span > 0 ? (t - keys[a].t) / span : 1
  return { a, b, f: ease(keys[b].ease, u) }
}

/** Sample a single angle track at time t (shortest-arc interpolation, wrapped). */
function sampleAngleTrack(keys: Clip['tracks'][number]['keys'], t: number): number {
  const { a, b, f } = locate(keys, t)
  if (a === b) return keys[a].angle
  return wrapPi(keys[a].angle + wrapPi(keys[b].angle - keys[a].angle) * f)
}

/**
 * Sample every track (and the root track, if any) at `tMs`. For loop clips the
 * time is wrapped modulo duration first, so a caller may pass a monotonically
 * increasing playhead and get seamless looping.
 */
export function sampleClip(clip: Clip, tMs: number): ClipSample {
  const t = wrapTime(clip, tMs)
  const angles: Record<string, number> = {}
  for (const track of clip.tracks) angles[track.jointId] = sampleAngleTrack(track.keys, t)

  let root: RootOffset | undefined
  if (clip.rootTrack) {
    const keys = clip.rootTrack.keys
    const { a, b, f } = locate(keys, t)
    if (a === b) root = { x: keys[a].x, y: keys[a].y, rot: keys[a].rot }
    else
      root = {
        x: lerp(keys[a].x, keys[b].x, f),
        y: lerp(keys[a].y, keys[b].y, f),
        rot: wrapPi(keys[a].rot + wrapPi(keys[b].rot - keys[a].rot) * f),
      }
  }
  return root ? { angles, root } : { angles }
}

/** Wrap a playhead time to [0, duration) for loop clips; clamp is left to sampling for one-shots. */
function wrapTime(clip: Clip, tMs: number): number {
  if (!clip.loop) return tMs
  const dur = clipDuration(clip)
  if (dur <= 0) return 0
  return ((tMs % dur) + dur) % dur
}

/**
 * Which marker events are crossed in the half-open interval (prevTMs, tMs]?
 * Returned in chronological order. Exact-boundary rule: a marker at time m fires
 * on the tick whose interval's upper bound first reaches m (prev < m <= t), so it
 * fires exactly ONCE and never on the immediately following tick (whose prev == m).
 *
 * Loop-aware: for a looping clip the interval is interpreted on the raw (monotonic)
 * playhead, so each lap re-fires every marker exactly once — including when a single
 * tick straddles the wrap point. Callers pass raw accumulated times, not wrapped.
 *
 * t=0 CAVEAT (a direct consequence of the (prev, t] contract): playback starts AT
 * t=0, so a t=0 marker is never crossed INTO on a one-shot clip — it would be a
 * silent dead letter, and tryValidateClip rejects it (move it to t > 0). On a loop
 * clip a t=0 marker's crossing times are k·duration (k ≥ 1): it fires at each LAP
 * COMPLETION, never at clip start (clipWarnings notes this).
 */
export function markersCrossed(clip: Clip, prevTMs: number, tMs: number): string[] {
  const markers = clip.markers
  if (!markers || markers.length === 0 || tMs <= prevTMs) return []

  const hits: { at: number; event: string }[] = []
  if (clip.loop) {
    const dur = clipDuration(clip)
    if (dur <= 0) return []
    for (const m of markers) {
      // Absolute crossing times are m.t + k·dur; collect those in (prev, t].
      let k = Math.floor((prevTMs - m.t) / dur) + 1
      // Guard against pathological huge intervals (still bounded by the caller's dt).
      while (k * dur + m.t <= tMs) {
        const at = m.t + k * dur
        if (at > prevTMs) hits.push({ at, event: m.event })
        k++
      }
    }
  } else {
    for (const m of markers) {
      if (m.t > prevTMs && m.t <= tMs) hits.push({ at: m.t, event: m.event })
    }
  }
  hits.sort((p, q) => p.at - q.at)
  return hits.map((h) => h.event)
}

// ── stateful convenience player ────────────────────────────────────────────────

export interface ClipPlayerState {
  clipId: string
  timeMs: number
}

/**
 * A thin stateful wrapper over sampleClip/markersCrossed: owns a playhead, advances
 * it by dt (ms), and reports markers crossed each advance. Pure/deterministic — no
 * clock, no bus. Used by the headless marker trace and the dev live-play harness;
 * the blender tracks its own playhead separately (it may retarget the source).
 */
export interface ClipPlayer {
  advance(dtMs: number): { sample: ClipSample; markers: string[] }
  sample(): ClipSample
  readonly timeMs: number
  reset(): void
  getState(): ClipPlayerState
  setState(state: ClipPlayerState): void
}

export function createClipPlayer(clip: Clip, startMs = 0): ClipPlayer {
  let t = startMs
  return {
    advance(dtMs) {
      const prev = t
      t += dtMs
      return { sample: sampleClip(clip, t), markers: markersCrossed(clip, prev, t) }
    },
    sample() {
      return sampleClip(clip, t)
    },
    get timeMs() {
      return t
    },
    reset() {
      t = startMs
    },
    getState() {
      return { clipId: clip.id, timeMs: t }
    },
    setState(state) {
      if (state.clipId !== clip.id) {
        throw new Error(`ClipPlayer.setState: clip id mismatch (player has ${JSON.stringify(clip.id)}, state is for ${JSON.stringify(state.clipId)})`)
      }
      t = state.timeMs
    },
  }
}

// Re-export Pose only to keep this module's public types self-describing without a
// second import in consumers that already pull from @dash/engine.
export type { Pose }
