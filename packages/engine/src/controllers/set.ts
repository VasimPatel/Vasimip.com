// Controller set (L2) — the small convenience that wires the standard always-on
// controllers to a blender and exposes the eye aux channel + a per-tick update.
//
// It registers the ANGLE additives (breathing, weight-shift, look-at head) on the
// blender at construction and unregisters them on dispose(). The FACE contributors
// (blink, look-at pupils) are pulled by update(tick), which returns this tick's
// FaceAux. Look-at needs the head's solved world frame, so the caller feeds each
// tick's post-FK skeleton back via feedSolved() — a one-frame lag, which is the
// bounded gaze lag the gate allows.
//
// Intended per-tick wiring (idle):
//   const face = set.update(tick)        // advances blink/pupils, returns FaceAux
//   const { pose } = blender.tick()      // pulls additives incl. look-at head
//   const solved = solveFk(rig, pose, …) // post-additive FK
//   set.feedSolved(solved)               // frame for NEXT tick's look-at
//   renderer.render(solved, face)
//
// Full per-tick order WITH the P5 secondary (normative — one shared verlet solver):
//   const face = set.update(tick)
//   const { pose } = blender.tick()
//   const solved = solveFk(rig, pose, …) // POST-ADDITIVE — the verlet tap point
//   set.feedSolved(solved)
//   secondary.step(solved)               // updates verlet pin/spring TARGETS only
//   world.step()                         // the ONE shared solve (secondary+props+ropes)
//   renderer.render(solved, face, secondary.overrides())
// secondary.step does NOT step the world (the world is shared): a scene with N
// characters updates N secondaries then steps the single solver once.
//
// Controllers are BEHAVIOR, not blender state: after blender.setState(...) the
// caller rebuilds the set (or re-adds additives) exactly as it re-registers any
// additive. Blink carries a tiny schedule counter — snapshot via getBlinkState().

import type { CharacterDoc, PersonalityParams, RigTemplate } from '@dash/schema'
import type { Blender } from '../blender'
import type { SolvedSkeleton } from '../fk'
import type { Rng } from '../rng'
import { breathing } from './breathing'
import { weightShift } from './weight-shift'
import { blink, type BlinkState } from './blink'
import { lookAt, type HeadFrame, type LookAtOptions } from './look-at'
import { NEUTRAL_FACE, type FaceAux } from './face'

const HEAD_JOINT_ID = 'head'

export interface ControllerSetOptions {
  rng: Rng
  /** Look-at target getter (world px). Omit or return null → no look-at. */
  getTarget?: () => { x: number; y: number } | null
  /** Override the character's personality (defaults to character.personality). */
  personality?: PersonalityParams
  lookAt?: LookAtOptions
}

export interface ControllerSet {
  /** Additive ids registered on the blender (breathing, weightShift, lookAt). */
  readonly additiveIds: readonly string[]
  /** Advance the face contributors and return this tick's aux channel. */
  update(tick: number): FaceAux
  /** Feed the post-additive FK so the NEXT tick's look-at has a head frame. */
  feedSolved(solved: SolvedSkeleton): void
  /** Snapshot the blink schedule (back-compat; prefer getState). */
  getBlinkState(): BlinkState
  setBlinkState(s: BlinkState): void
  /** FULL controller-set snapshot: blink schedule + the one-frame-lagged head frame
   * the look-at reads (null until the first feedSolved). Restoring only the blink
   * state loses the head frame and makes the first post-restore gaze tick diverge. */
  getState(): ControllerSetState
  setState(s: ControllerSetState): void
  /** Unregister every additive this set added to the blender. */
  dispose(): void
}

/** Plain-JSON snapshot of the set (see getState). */
export interface ControllerSetState {
  blink: BlinkState
  head: HeadFrame | null
}

export function createControllerSet(
  blender: Blender,
  rig: RigTemplate,
  character: CharacterDoc,
  opts: ControllerSetOptions,
): ControllerSet {
  const personality = opts.personality ?? character.personality
  const hasHead = rig.joints.some((j) => j.id === HEAD_JOINT_ID)

  let lastHead: HeadFrame | null = null

  const breathe = breathing(personality)
  const sway = weightShift(personality)
  const blinker = blink(opts.rng)
  const gaze = opts.getTarget
    ? lookAt(opts.getTarget, () => lastHead, opts.lookAt)
    : null

  blender.addAdditive(breathe.id, breathe.fn)
  blender.addAdditive(sway.id, sway.fn)
  if (gaze) blender.addAdditive(gaze.id, gaze.fn)

  const additiveIds = gaze ? [breathe.id, sway.id, gaze.id] : [breathe.id, sway.id]

  return {
    additiveIds,

    update(tick: number): FaceAux {
      const face: FaceAux = { ...NEUTRAL_FACE }
      const b = blinker.face(tick)
      if (b.blink !== undefined) face.blink = b.blink
      if (gaze) {
        const g = gaze.face(tick)
        if (g.pupilDx !== undefined) face.pupilDx = g.pupilDx
        if (g.pupilDy !== undefined) face.pupilDy = g.pupilDy
      }
      return face
    },

    feedSolved(solved: SolvedSkeleton): void {
      if (!hasHead) return
      const head = solved.bones.find((bn) => bn.id === HEAD_JOINT_ID)
      if (head) lastHead = { cx: head.ex, cy: head.ey, worldAngle: head.worldAngle }
    },

    getBlinkState: () => blinker.getState(),
    setBlinkState: (s) => blinker.setState(s),

    getState: () => ({ blink: blinker.getState(), head: lastHead ? { ...lastHead } : null }),
    setState(s: ControllerSetState): void {
      blinker.setState(s.blink)
      lastHead = s.head ? { ...s.head } : null
    },

    dispose(): void {
      for (const id of additiveIds) blender.removeAdditive(id)
    },
  }
}
