// Squash & stretch flourish (charm checkpoint) — the legacy poses baked squash into
// the art (Land is a squashed ball). The engine's systematic equivalent: a transient
// whole-figure scale driven by motion events, applied by the renderer as a group
// transform about the character's ground point. Pure + tick-based (deterministic,
// unit-testable); the renderer just reads tick()'s result each frame.
//
// Spring model (parity pass): an UNDERDAMPED spring toward rest — the legacy landing
// is a damped OSCILLATION (`settle`: 1.18/.8 → .9/1.13 → 1.08/.93 → … → 1), not a
// monotone return. Ring frequency and decay are fitted to those keyframes: half
// period ≈ 105 ms, successive peaks ≈ ×0.5. Velocity carries between triggers (same
// no-pop philosophy as the blender), so a land during a stretch doesn't snap.
//
// 'windup' is a HELD crouch (jump anticipation): the spring targets the crouch until
// the next trigger or releaseHold() — the legacy `windup .16s forwards` freeze.

import { STEP_MS } from '../loop'

const DT = STEP_MS / 1000
/** Ring frequency (rad/s): half period ≈ 105 ms like the legacy settle keyframes. */
const OMEGA = 30
/** Damping ratio: successive overshoot peaks decay ≈ ×0.5 per half cycle. */
const ZETA = 0.22
/** The held-crouch approach is snappy and non-ringing (legacy: .16s ease-in). */
const HOLD_OMEGA = 34
const HOLD_ZETA = 1.05

export type FlourishKind = 'land' | 'launch' | 'poke' | 'windup'

const KICKS: Record<FlourishKind, { sx: number; sy: number }> = {
  land: { sx: 1.22, sy: 0.72 }, // wide squash — punchy landing, rings out
  launch: { sx: 0.9, sy: 1.14 }, // upward stretch at takeoff
  poke: { sx: 1.12, sy: 0.86 }, // small jelly pop
  windup: { sx: 1.16, sy: 0.78 }, // anticipation crouch — HELD until launch
}

export interface SquashFlourish {
  trigger(kind: FlourishKind): void
  /** Drop a held windup without a kick (interrupted anticipation). */
  releaseHold(): void
  /** Advance one tick; returns the current scales (1,1 at rest). */
  tick(): { sx: number; sy: number }
  /** True while visually active (renderer may skip the transform at rest). */
  active(): boolean
  getState(): { sx: number; sy: number; vx: number; vy: number; hold?: { sx: number; sy: number } | null }
  setState(s: { sx: number; sy: number; vx: number; vy: number; hold?: { sx: number; sy: number } | null }): void
}

export function createSquashFlourish(): SquashFlourish {
  let sx = 1
  let sy = 1
  let vx = 0
  let vy = 0
  let hold: { sx: number; sy: number } | null = null

  function springTo(value: number, target: number, velocity: number, omega: number, zeta: number): { value: number; velocity: number } {
    // Semi-implicit Euler — stable at 120 Hz for these frequencies.
    const acc = -omega * omega * (value - target) - 2 * zeta * omega * velocity
    const v = velocity + acc * DT
    return { value: value + v * DT, velocity: v }
  }

  return {
    trigger(kind) {
      const k = KICKS[kind]
      if (kind === 'windup') {
        // Anticipation: approach and HOLD the crouch; the launch kick releases it.
        hold = { sx: k.sx, sy: k.sy }
        return
      }
      hold = null
      // Kick position directly; keep velocity (a mid-air retrigger stays smooth).
      sx = k.sx
      sy = k.sy
    },
    releaseHold() {
      hold = null
    },
    tick() {
      const tx = hold ? hold.sx : 1
      const ty = hold ? hold.sy : 1
      const omega = hold ? HOLD_OMEGA : OMEGA
      const zeta = hold ? HOLD_ZETA : ZETA
      const rx = springTo(sx, tx, vx, omega, zeta)
      sx = rx.value
      vx = rx.velocity
      const ry = springTo(sy, ty, vy, omega, zeta)
      sy = ry.value
      vy = ry.velocity
      return { sx, sy }
    },
    active() {
      return hold != null || Math.abs(sx - 1) > 0.004 || Math.abs(sy - 1) > 0.004 || Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02
    },
    getState: () => ({ sx, sy, vx, vy, hold: hold ? { ...hold } : null }),
    setState(s) {
      sx = s.sx
      sy = s.sy
      vx = s.vx
      vy = s.vy
      hold = s.hold ? { ...s.hold } : null
    },
  }
}
