/**
 * The flame's per-frame light sample.
 *
 * This used to be a subtle noise-driven flicker (the one fast motion on the
 * site), but the owner asked for a STEADY light that simply tracks the cursor —
 * no intensity wobble, no positional jitter, no warm-shift. So `sample` now
 * always returns the steady value. Kept as a seam (same shape, same call sites)
 * so a flicker could be reintroduced behind a flag if ever wanted.
 */
import { TORCH } from './torch.constants'

export interface FlickerSample {
  /** absolute light intensity this frame */
  intensity: number
  /** flicker factor (also fed to the ink ring uniform) — steady at 1 */
  factor: number
  /** world-space position sway — steady at 0 (no jitter) */
  jitterX: number
  jitterY: number
  /** 0..1 dim-trough amount for the warm micro-shift — steady at 0 */
  warm: number
}

const STEADY: FlickerSample = {
  intensity: TORCH.intensityBase,
  factor: 1,
  jitterX: 0,
  jitterY: 0,
  warm: 0,
}

export function createFlicker(_seed = 0x5151) {
  // a steady, non-flickering light — returns the same sample every frame
  return function sample(_time: number, _reduced: boolean): FlickerSample {
    return STEADY
  }
}
