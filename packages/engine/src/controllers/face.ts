// Eye/face aux channel (L2) — a RUNTIME channel, NOT part of Pose/Clip/schema.
//
// The controller set produces one FaceAux per tick alongside the post-additive
// pose. It is a renderer-convention extension (like the 'head' circle): the SVG
// renderer reads it to place pupils and squash lids, and P2/P3 callers that never
// pass one render a neutral (open, centered) face. It never enters the component
// model and needs no schema field.
//
//   pupilDx/pupilDy — pupil offset from the eye centre, in rig px BEFORE the
//                     renderer clamps it inside the eye area (look-at drives it).
//   blink           — 0 fully open .. 1 fully closed (lids squash the eye to a line).
//
// CHARM EXTENSION (owner checkpoint, 2026-07-11) — the legacy Dash face is dark
// pupils sitting directly on the paper-coloured head (NO whites), angled BROWS
// carrying the attitude, and a tiny mouth. These are expression states the renderer
// draws; the expression controller (expression.ts) derives them from behavior
// events. All optional with neutral defaults, so every pre-charm caller renders
// unchanged.
//
//   facing    — +1 facing right (default), −1 left; shifts the eye pair toward the
//               heading the way the legacy 3/4-view art does.
//   brow      — brow state; 'determined' is Dash's resting attitude (the legacy V).
//   mouth     — mouth state; 'smile' is the legacy resting q-curve.
//   intensity — 0..1: how hard the brow/mouth read (reactions decay back to resting
//               instead of snapping).

export type BrowState = 'determined' | 'fierce' | 'neutral' | 'raised' | 'worried'
export type MouthState = 'smile' | 'grit' | 'o' | 'none'

export interface FaceAux {
  pupilDx: number
  pupilDy: number
  blink: number
  facing?: 1 | -1
  brow?: BrowState
  mouth?: MouthState
  intensity?: number
}

export const NEUTRAL_FACE: FaceAux = { pupilDx: 0, pupilDy: 0, blink: 0 }

/** Dash at rest: the determined V-brows + little smile from the legacy Idle art. */
export const RESTING_FACE: FaceAux = {
  pupilDx: 0,
  pupilDy: 0,
  blink: 0,
  facing: 1,
  brow: 'determined',
  mouth: 'smile',
  intensity: 0.5,
}

/** A face contributor: reads the sim tick, returns a partial FaceAux to accumulate.
 * (blink writes `blink`; look-at writes `pupilDx/Dy`; expression writes
 * brow/mouth/intensity/facing — they never collide.) */
export type FaceFn = (tick: number) => Partial<FaceAux>
