// Squash & stretch flourish (charm checkpoint) — the legacy poses baked squash into
// the art (Land is a squashed ball). The engine's systematic equivalent: a transient
// whole-figure scale driven by motion events, applied by the renderer as a group
// transform about the character's ground point. Pure + tick-based (deterministic,
// unit-testable); the renderer just reads tick()'s result each frame.
//
// Spring model: scale offsets (sx−1, sy−1) are a critically-damped spring toward 0,
// kicked by trigger(). Velocity carries between triggers (same no-pop philosophy as
// the blender), so a land during a stretch doesn't snap.

import { smoothDamp } from '../math'
import { STEP_MS } from '../loop'

const DT = STEP_MS / 1000
/** Return-to-1 smooth time — short and punchy; the kick itself is instantaneous. */
const SETTLE_S = 0.075

export type FlourishKind = 'land' | 'launch' | 'poke'

const KICKS: Record<FlourishKind, { sx: number; sy: number }> = {
  land: { sx: 1.22, sy: 0.72 }, // wide squash — punchy landing
  launch: { sx: 0.9, sy: 1.14 }, // upward stretch at takeoff
  poke: { sx: 1.12, sy: 0.86 }, // small jelly pop
}

export interface SquashFlourish {
  trigger(kind: FlourishKind): void
  /** Advance one tick; returns the current scales (1,1 at rest). */
  tick(): { sx: number; sy: number }
  /** True while visually active (renderer may skip the transform at rest). */
  active(): boolean
  getState(): { sx: number; sy: number; vx: number; vy: number }
  setState(s: { sx: number; sy: number; vx: number; vy: number }): void
}

export function createSquashFlourish(): SquashFlourish {
  let sx = 1
  let sy = 1
  let vx = 0
  let vy = 0

  return {
    trigger(kind) {
      const k = KICKS[kind]
      // Kick position directly; keep velocity (a mid-air retrigger stays smooth).
      sx = k.sx
      sy = k.sy
    },
    tick() {
      const rx = smoothDamp(sx, 1, vx, SETTLE_S, DT)
      sx = rx.value
      vx = rx.velocity
      const ry = smoothDamp(sy, 1, vy, SETTLE_S, DT)
      sy = ry.value
      vy = ry.velocity
      return { sx, sy }
    },
    active() {
      return Math.abs(sx - 1) > 0.004 || Math.abs(sy - 1) > 0.004
    },
    getState: () => ({ sx, sy, vx, vy }),
    setState(s) {
      sx = s.sx
      sy = s.sy
      vx = s.vx
      vy = s.vy
    },
  }
}
