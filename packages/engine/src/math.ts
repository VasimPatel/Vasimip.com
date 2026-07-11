// Small pure math helpers for the blend layer (L1b). Deterministic, allocation-
// light. `smoothDamp` is the exact critically-damped spring approximation the
// Spike B findings validated (Game-Programming-Gems / Unity Mathf.SmoothDamp
// form) — velocity carried across calls is the no-pop mechanism.

const TWO_PI = Math.PI * 2

/** Wrap an angle to [−π, π] via the shortest-arc identity atan2(sin, cos). */
export function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Result of a SmoothDamp step: the new value and the carried velocity. */
export interface SmoothDampResult {
  value: number
  velocity: number
}

/**
 * Critically-damped SmoothDamp toward `target`. `velocity` MUST be threaded back
 * in on the next call (never reset) — that carried velocity is what makes an
 * interrupt (a change of target mid-motion) continue smoothly instead of popping.
 * dt and smoothTime are in the SAME time unit (seconds here).
 */
export function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number): SmoothDampResult {
  const st = Math.max(1e-4, smoothTime)
  const omega = 2 / st
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (velocity + omega * change) * dt
  const newVelocity = (velocity - omega * temp) * exp
  const value = target + (change + temp) * exp
  return { value, velocity: newVelocity }
}

/**
 * Angle-aware SmoothDamp: identical dynamics, but the target is first moved to the
 * shortest-arc equivalent of `current` (wrapPi of the difference) so a chase never
 * takes the long way around, and the output is wrapped back to [−π, π]. The
 * carried velocity stays the true angular rate (unwrapped), so it composes across
 * wraps and retargets without discontinuity.
 */
export function smoothDampAngle(current: number, target: number, velocity: number, smoothTime: number, dt: number): SmoothDampResult {
  // Nearest equivalent target: current − shortestArc(current − target).
  const nearestTarget = current - wrapPi(current - target)
  const r = smoothDamp(current, nearestTarget, velocity, smoothTime, dt)
  return { value: wrapPi(r.value), velocity: r.velocity }
}

export { TWO_PI }
