// Eye/face aux channel (L2) — a RUNTIME channel, NOT part of Pose/Clip/schema.
//
// The controller set produces one FaceAux per tick alongside the post-additive
// pose. It is a renderer-convention extension (like the 'head' circle): the SVG
// renderer reads it to place pupils and squash lids, and P2/P3 callers that never
// pass one render a neutral (open, centered) face. It never enters the component
// model and needs no schema field.
//
//   pupilDx/pupilDy — pupil offset from the eye centre, in rig px BEFORE the
//                     renderer clamps it inside the eye white (look-at drives it).
//   blink           — 0 fully open .. 1 fully closed (lids squash the eye to a line).

export interface FaceAux {
  pupilDx: number
  pupilDy: number
  blink: number
}

export const NEUTRAL_FACE: FaceAux = { pupilDx: 0, pupilDy: 0, blink: 0 }

/** A face contributor: reads the sim tick, returns a partial FaceAux to accumulate.
 * (blink writes `blink`; look-at writes `pupilDx/Dy` — they never collide.) */
export type FaceFn = (tick: number) => Partial<FaceAux>
