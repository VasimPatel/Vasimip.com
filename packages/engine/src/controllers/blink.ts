// Blink controller (L2) — NOT a joint additive: it drives the eye aux channel.
// Blinks fire at seeded-random intervals (2–6 s); each is a short close→open
// envelope (~120 ms). The ONLY randomness allowed in the engine is the seeded Rng
// (Math.random is lint-banned), so the schedule is threaded through `rng` and is
// therefore fully deterministic for a fixed seed + fixed call cadence.
//
// The controller is stateful but pure: it advances off the monotonic sim tick, so
// snapshot/replay just needs the rng state (the caller owns that) plus this
// controller's small internal counters, exposed via getState/setState.

import type { Rng } from '../rng'
import type { FaceFn } from './face'
import { STEP_MS } from '../loop'

const MIN_MS = 2000
const MAX_MS = 6000
const CLOSE_MS = 40 // lids down
const OPEN_MS = 80 // lids back up  (~120 ms total)

export interface BlinkController {
  id: string
  face: FaceFn
  getState(): BlinkState
  setState(s: BlinkState): void
}

export interface BlinkState {
  /** Tick index at which the next blink begins (-1 = not yet scheduled). */
  nextStart: number
}

export function blink(rng: Rng): BlinkController {
  const closeTicks = CLOSE_MS / STEP_MS
  const openTicks = OPEN_MS / STEP_MS
  const dur = closeTicks + openTicks
  let nextStart = -1

  function schedule(fromTick: number): void {
    const ms = MIN_MS + rng.float() * (MAX_MS - MIN_MS)
    nextStart = fromTick + Math.round(ms / STEP_MS)
  }

  return {
    id: 'blink',
    face(tick: number) {
      if (nextStart < 0) schedule(tick) // lazy first schedule pulls one rng value
      if (tick < nextStart) return { blink: 0 }
      const p = tick - nextStart
      if (p >= dur) {
        schedule(tick)
        return { blink: 0 }
      }
      // Triangle envelope: 0→1 over CLOSE, 1→0 over OPEN.
      const b = p < closeTicks ? p / closeTicks : 1 - (p - closeTicks) / openTicks
      return { blink: b < 0 ? 0 : b > 1 ? 1 : b }
    },
    getState: () => ({ nextStart }),
    setState: (s) => {
      nextStart = s.nextStart
    },
  }
}
