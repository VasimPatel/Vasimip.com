/**
 * The flicker of the flame — the ONLY fast motion on the whole site (brief §5).
 * Noise-driven, subtle, irregular: never sinusoidal, never a strobe. Two simplex
 * octaves over time drive intensity; a slow sway nudges position sub-perceptibly;
 * the color creeps ~3% warmer on the dim troughs.
 *
 * Reduced-motion kill switch: lock to steady. The torch still TRACKS the cursor
 * (that's interaction, not motion) — it just stops flickering.
 */
import { createNoise3D } from 'simplex-noise'
import { mulberry32 } from '@/lib/rng'
import { FLICKER, TORCH } from './torch.constants'

export interface FlickerSample {
  /** absolute light intensity this frame */
  intensity: number
  /** flicker factor ~0.9–1.12 (also fed to the vellum ring uniform) */
  factor: number
  /** sub-perceptual world-space position sway */
  jitterX: number
  jitterY: number
  /** 0..1, how far into a dim trough (for the warm color micro-shift) */
  warm: number
}

const STEADY: FlickerSample = {
  intensity: TORCH.intensityBase,
  factor: 1,
  jitterX: 0,
  jitterY: 0,
  warm: 0,
}

export function createFlicker(seed = 0x5151) {
  const noise = createNoise3D(mulberry32(seed))

  return function sample(time: number, reduced: boolean): FlickerSample {
    if (reduced) return STEADY
    const n1 = noise(time * FLICKER.freq1, 0, 0)
    const n2 = noise(time * FLICKER.freq2, 100, 0)
    const factor = 1 + FLICKER.amp1 * n1 + FLICKER.amp2 * n2
    const jitterX = noise(time * FLICKER.freqJitter, 0, 40) * FLICKER.jitter
    const jitterY = noise(0, time * FLICKER.freqJitter, 70) * FLICKER.jitter
    const warm = Math.max(0, 1 - factor) / FLICKER.amp1 // 0..~1 on troughs
    return {
      intensity: TORCH.intensityBase * factor,
      factor,
      jitterX,
      jitterY,
      warm: Math.min(1, warm),
    }
  }
}
