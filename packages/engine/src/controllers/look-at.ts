// Look-at controller (L2) — steers the gaze toward a world-space target. Like the
// legacy site, the PUPILS do most of the work (a big, snappy offset) and the HEAD
// follows only subtly (a small, clamped joint delta). Two outputs:
//   • fn   — an ADDITIVE joint delta on 'head' (clamped ±MAX_HEAD rad), nudging the
//            head's WORLD angle toward the target. Runs pre-FK inside the blender.
//   • face — the pupil offset (pupilDx/Dy) for the aux channel.
//
// The head delta and pupil offset are computed from the target and the LAST solved
// head frame (fed back by the controller set after FK). That one-frame lag is the
// "bounded lag" the gate allows and matches how the legacy pupils trailed the
// cursor. Target and head frame come from getters so the site can wire the cursor
// and headless tests can script a moving point. Deterministic (no clock, no random).

import type { AdditiveFn } from '../blender'
import type { FaceFn } from './face'
import { wrapPi } from '../math'

/** World-space frame of the head circle: centre + the head bone's world angle. */
export interface HeadFrame {
  cx: number
  cy: number
  worldAngle: number
}

export interface LookAtOptions {
  /** Max head-angle delta (rad). Default 0.35 — head follows subtly. */
  maxHead?: number
  /** Fraction of the angular error the head takes each solve (default 0.4). */
  headGain?: number
  /** Pupil travel (px) at a full-forward target, before renderer clamps to eye. */
  pupilRange?: number
}

export interface LookAtController {
  id: string
  fn: AdditiveFn
  face: FaceFn
}

const DEFAULT_MAX_HEAD = 0.35
const DEFAULT_HEAD_GAIN = 0.4
const DEFAULT_PUPIL_RANGE = 3

export function lookAt(
  getTarget: () => { x: number; y: number } | null,
  getHead: () => HeadFrame | null,
  opts?: LookAtOptions,
): LookAtController {
  const maxHead = opts?.maxHead ?? DEFAULT_MAX_HEAD
  const headGain = opts?.headGain ?? DEFAULT_HEAD_GAIN
  const pupilRange = opts?.pupilRange ?? DEFAULT_PUPIL_RANGE

  /** Shortest-arc angular error between the head's current world angle and the
   * direction to the target. Null if no target or no head frame yet. */
  function error(): { err: number; dx: number; dy: number } | null {
    const target = getTarget()
    const head = getHead()
    if (!target || !head) return null
    const dx = target.x - head.cx
    const dy = target.y - head.cy
    if (dx === 0 && dy === 0) return { err: 0, dx: 0, dy: 0 }
    const desired = Math.atan2(dy, dx)
    return { err: wrapPi(desired - head.worldAngle), dx, dy }
  }

  return {
    id: 'lookAt',
    fn() {
      const e = error()
      if (!e) return {}
      let d = headGain * e.err
      if (d > maxHead) d = maxHead
      else if (d < -maxHead) d = -maxHead
      return { angles: { head: d } }
    },
    face() {
      const e = error()
      if (!e) return {}
      const len = Math.hypot(e.dx, e.dy)
      if (len === 0) return { pupilDx: 0, pupilDy: 0 }
      // Screen-space direction to the target, like the legacy translate(lookX,lookY).
      return { pupilDx: (e.dx / len) * pupilRange, pupilDy: (e.dy / len) * pupilRange }
    },
  }
}
