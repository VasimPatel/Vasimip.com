// Weight-shift controller (L2) — an always-on ADDITIVE contributor. A slow hip
// sway on a DIFFERENT, slower frequency than breathing so the two never lock into
// a metronome. The pelvis leans; the neck and thighs counter-lean a little so the
// head stays roughly over the feet.
//
// Personality: confidence WIDENS the stance sway (amplitude); sloppiness adds a
// SECOND incommensurate sine (golden-ratio frequency) so the sway never repeats on
// a tidy period — the anti-metronome trick. Deterministic (phase from the tick).

import type { PersonalityParams } from '@dash/schema'
import type { Controller } from './breathing'
import { STEP_MS } from '../loop'

const BASE_HZ = 0.12 // slower than breathing's 0.4 Hz
const PHI = 1.618033988749895 // incommensurate second frequency
const TWO_PI = Math.PI * 2

export function weightShift(personality: PersonalityParams): Controller {
  const amp = (0.5 + 0.7 * personality.confidence) * 0.02 // rad
  const amp2 = personality.sloppiness * 0.012
  const freq2 = BASE_HZ * PHI
  return {
    id: 'weightShift',
    fn(tick: number) {
      const t = (tick * STEP_MS) / 1000
      const sway = amp * Math.sin(TWO_PI * BASE_HZ * t) + amp2 * Math.sin(TWO_PI * freq2 * t)
      return {
        angles: {
          pelvis: sway,
          neck: -0.4 * sway, // counter-lean the spine
          thighR: -0.3 * sway,
          thighL: -0.3 * sway,
        },
      }
    },
  }
}
