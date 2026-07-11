// Clip (L1b) — keyframed pose animation. A Clip is a set of per-joint angle
// TRACKS (+ an optional root track) whose keys carry a time (ms from clip start),
// a value, and an EasePreset. Sampling/playback lives in packages/engine
// (sampleClip / createClipPlayer); this module is the schema + validators only,
// mirroring the Pose/Rig split. Zero deps.
//
// AUTHORING CONTRACT — easing applies to the segment ENDING at a key:
//   the interpolation from key[i-1] → key[i] uses key[i].ease. The FIRST key of a
//   track therefore has no segment ending at it, so its `ease` is IGNORED (it is
//   still required by the schema for uniformity). 'hold' = step-at-end: the value
//   stays at key[i-1] until the segment completes, then snaps to key[i].
//
// Time is authored in MILLISECONDS from clip start; the engine converts to ticks
// through STEP_MS (never wall ms). Loop clips wrap time modulo the clip duration.

import { tryValidate, isRecord, isNum, isStr, isArr, isBool, type ValidateResult, type Issues, type Check } from './validate'
import { tryValidateRig } from './rig'

/** Closed set of easing curves (cubic-based; 'hold' = step-at-segment-end). */
export type EasePreset = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'
export const EASE_PRESETS: readonly EasePreset[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold']
const EASE_SET = new Set<string>(EASE_PRESETS)

/** One angle keyframe: `t` ms from clip start, `angle` radians (local), `ease` for the segment ENDING here. */
export interface ClipKey {
  t: number
  angle: number
  ease: EasePreset
}

export interface ClipTrack {
  jointId: string
  keys: ClipKey[]
}

/** One root keyframe: position (x, y) + world rotation (rot, radians), eased into. */
export interface ClipRootKey {
  t: number
  x: number
  y: number
  rot: number
  ease: EasePreset
}

export interface ClipRootTrack {
  keys: ClipRootKey[]
}

export interface ClipMarker {
  t: number
  /**
   * Event name emitted on the bus when playback crosses this time (e.g. 'launch',
   * 'land'). Crossing uses the half-open interval (prev, t] — see markersCrossed
   * in packages/engine. Consequence: a t=0 marker can never be crossed INTO on a
   * one-shot clip (validation ERROR — move it to t > 0); on a loop clip it fires
   * at each LAP COMPLETION (t=duration), never at clip start (clipWarnings advisory).
   */
  event: string
}

export interface Clip {
  id: string
  tracks: ClipTrack[]
  rootTrack?: ClipRootTrack
  loop?: boolean
  markers?: ClipMarker[]
}

/**
 * Clip duration in ms = the largest key time across every angle track and the
 * root track. A clip whose tracks each hold a single key at t=0 has duration 0
 * (a static "clip"). Loop wrapping and marker-range checks use this.
 */
export function clipDuration(clip: Clip): number {
  let max = 0
  for (const track of clip.tracks) {
    const last = track.keys[track.keys.length - 1]
    if (last && last.t > max) max = last.t
  }
  if (clip.rootTrack) {
    const last = clip.rootTrack.keys[clip.rootTrack.keys.length - 1]
    if (last && last.t > max) max = last.t
  }
  return max
}

// ── validation ────────────────────────────────────────────────────────────────

/** Validate a keys array with a per-key value checker; enforces t≥0 and STRICTLY
 * increasing t (rejects unsorted AND duplicate-t in one pass). Returns last t. */
function checkKeys(
  keys: unknown,
  path: string,
  issues: Issues,
  perKey: (k: Record<string, unknown>, kp: string, issues: Issues) => void,
): void {
  if (!isArr(keys)) {
    issues.push(`${path}: required non-empty array of keys`)
    return
  }
  if (keys.length === 0) {
    issues.push(`${path}: required non-empty array of keys`)
    return
  }
  let prevT = Number.NEGATIVE_INFINITY
  keys.forEach((k, i) => {
    const kp = `${path}[${i}]`
    if (!isRecord(k)) {
      issues.push(`${kp}: must be an object`)
      return
    }
    if (!isNum(k.t)) issues.push(`${kp}.t: required finite number (ms from clip start)`)
    else {
      if (k.t < 0) issues.push(`${kp}.t: must be >= 0`)
      if (k.t <= prevT) issues.push(`${kp}.t: keys must be sorted with strictly increasing t (got ${k.t} after ${prevT})`)
      prevT = k.t
    }
    if (!isStr(k.ease) || !EASE_SET.has(k.ease)) {
      issues.push(`${kp}.ease: must be one of ${EASE_PRESETS.join(' | ')}`)
    }
    perKey(k, kp, issues)
  })
}

const clipChecks: readonly Check[] = [
  (d, issues) => {
    if (!isStr(d.id) || d.id.length === 0) issues.push('id: required non-empty string')

    if (!isArr(d.tracks) || d.tracks.length === 0) {
      issues.push('tracks: required non-empty array')
    } else {
      d.tracks.forEach((t, i) => {
        const tp = `tracks[${i}]`
        if (!isRecord(t)) return issues.push(`${tp}: must be an object`)
        if (!isStr(t.jointId) || t.jointId.length === 0) issues.push(`${tp}.jointId: required non-empty string`)
        checkKeys(t.keys, `${tp}.keys`, issues, (k, kp, iss) => {
          if (!isNum(k.angle)) iss.push(`${kp}.angle: required finite number (radians)`)
        })
      })
    }

    if (d.rootTrack !== undefined) {
      if (!isRecord(d.rootTrack)) issues.push('rootTrack: must be an object { keys: [...] }')
      else
        checkKeys(d.rootTrack.keys, 'rootTrack.keys', issues, (k, kp, iss) => {
          if (!isNum(k.x)) iss.push(`${kp}.x: required finite number`)
          if (!isNum(k.y)) iss.push(`${kp}.y: required finite number`)
          if (!isNum(k.rot)) iss.push(`${kp}.rot: required finite number (radians)`)
        })
    }

    if (d.loop !== undefined && !isBool(d.loop)) issues.push('loop: must be a boolean when present')

    if (d.markers !== undefined) {
      if (!isArr(d.markers)) issues.push('markers: must be an array')
      else {
        // Duration derived from tracks already checked above; recompute defensively
        // (a structurally bad clip still gets useful marker errors).
        const dur = isArr(d.tracks) ? clipDuration({ id: '', tracks: d.tracks as ClipTrack[], rootTrack: d.rootTrack as ClipRootTrack | undefined }) : 0
        d.markers.forEach((m, i) => {
          const mp = `markers[${i}]`
          if (!isRecord(m)) return issues.push(`${mp}: must be an object { t, event }`)
          if (!isStr(m.event) || m.event.length === 0) issues.push(`${mp}.event: required non-empty string`)
          if (!isNum(m.t)) issues.push(`${mp}.t: required finite number`)
          else if (m.t < 0 || m.t > dur) issues.push(`${mp}.t: must be within clip duration [0, ${dur}] (got ${m.t})`)
          else if (m.t === 0 && d.loop !== true) {
            // markersCrossed uses the half-open interval (prev, t] — playback starts
            // AT 0, so a t=0 marker on a one-shot clip is a silent dead letter.
            issues.push(`${mp}.t: t=0 will never fire on a non-loop clip (markers fire on crossing INTO t) — move it to t > 0`)
          }
        })
      }
    }
  },
]

/** Structural clip validation — shape only, no rig cross-check. */
export function tryValidateClip(doc: unknown): ValidateResult<Clip> {
  return tryValidate<Clip>(doc, clipChecks)
}

/**
 * Validate a clip against a rig: structural checks PLUS every track's `jointId`
 * must name a joint that exists in the rig.
 */
export function validateClipAgainstRig(clip: unknown, rig: unknown): ValidateResult<Clip> {
  const structural = tryValidateClip(clip)
  if (!structural.ok) return structural

  const rigResult = tryValidateRig(rig)
  if (!rigResult.ok) return { ok: false, errors: [`rig: invalid (${rigResult.errors.length} problem(s))`] }

  const known = new Set(rigResult.doc.joints.map((j) => j.id))
  const errors: string[] = []
  for (const track of structural.doc.tracks) {
    if (!known.has(track.jointId)) errors.push(`tracks: unknown joint ${JSON.stringify(track.jointId)} (not in rig ${JSON.stringify(rigResult.doc.id)})`)
  }
  if (errors.length > 0) return { ok: false, errors }
  return structural
}

/**
 * WARNING-level lint (NOT part of tryValidateClip errors): a loop clip SHOULD have
 * matching first/last key values per track so the wrap is seamless. Returns a list
 * of human-readable warnings (empty when the clip is clean or not a loop). Kept
 * separate from the error validator deliberately — a mismatched loop still plays,
 * it just pops at the wrap; the authoring tools surface these as advisories.
 */
export function clipWarnings(clip: Clip): string[] {
  if (!clip.loop) return []
  const EPS = 1e-4
  const out: string[] = []
  for (const track of clip.tracks) {
    const first = track.keys[0]
    const last = track.keys[track.keys.length - 1]
    if (first && last && first !== last && Math.abs(first.angle - last.angle) > EPS) {
      out.push(`loop track ${JSON.stringify(track.jointId)}: first angle ${first.angle} != last angle ${last.angle} — wrap will pop`)
    }
  }
  if (clip.rootTrack) {
    const first = clip.rootTrack.keys[0]
    const last = clip.rootTrack.keys[clip.rootTrack.keys.length - 1]
    if (first && last && first !== last) {
      for (const key of ['x', 'y', 'rot'] as const) {
        if (Math.abs(first[key] - last[key]) > EPS) out.push(`loop rootTrack.${key}: first ${first[key]} != last ${last[key]} — wrap will pop`)
      }
    }
  }
  if (clip.markers) {
    for (const m of clip.markers) {
      if (m.t === 0) {
        out.push(`marker ${JSON.stringify(m.event)} at t=0 on a loop clip fires at each LAP COMPLETION (t=duration), never at clip start — author it at t=duration if that reads clearer`)
      }
    }
  }
  return out
}
