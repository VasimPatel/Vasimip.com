// Breathing controller (L2) — an always-on ADDITIVE contributor. A single slow
// sine (Spike B: 0.4 Hz) lifts the spine/shoulders and bobs the root. Deltas go
// through the blender's throwaway additive buffer (never written back), so the
// oscillation can't drift the base pose.
//
// Personality (Spike B tuning is the base): energy scales the RATE slightly,
// bounciness scales the AMPLITUDE. Phase is derived from the tick (deterministic;
// no wall clock).

import type { PersonalityParams } from '@dash/schema'
import type { AdditiveFn } from '../blender'
import { STEP_MS } from '../loop'

const BASE_HZ = 0.4
const TWO_PI = Math.PI * 2

// Spike B amplitudes (rad / px), scaled by `amp` below.
const CHEST = 0.03 // neck (spine) rises on the inhale
const HEAD = -0.018 // head counter-nods so the gaze stays level
const SHOULDER = 0.024 // upper arms lift symmetrically
const FOREARM = 0.014 // elbows follow the shoulders subtly
const ROOT_BOB = 1.2 // px

export interface Controller {
  id: string
  fn: AdditiveFn
}

export function breathing(personality: PersonalityParams): Controller {
  const freq = BASE_HZ * (1 + 0.3 * personality.energy)
  const amp = 0.6 + 0.8 * personality.bounciness
  return {
    id: 'breathing',
    fn(tick: number) {
      const t = (tick * STEP_MS) / 1000
      const s = Math.sin(TWO_PI * freq * t)
      return {
        angles: {
          neck: CHEST * amp * s,
          head: HEAD * amp * s,
          upperArmR: SHOULDER * amp * s,
          upperArmL: -SHOULDER * amp * s,
          foreArmR: FOREARM * amp * s,
          foreArmL: -FOREARM * amp * s,
        },
        rootY: -ROOT_BOB * amp * s, // negative = up (SVG y-down) on the inhale
      }
    },
  }
}
