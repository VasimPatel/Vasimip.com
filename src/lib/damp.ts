/**
 * Frame-rate-independent critical damping. This is where the descent gets its
 * MASS: scroll sets a target, and each frame the value eases toward it by a
 * fraction that depends on dt, so it settles and stops dead — no overshoot, no
 * spring (brief §5). Identical to THREE.MathUtils.damp, kept dependency-free.
 *
 *   x' = x + (target - x) * (1 - e^(-lambda*dt))
 *
 * Higher lambda = stiffer/quicker settle. ~4 reads as a heavy thing coming to
 * rest over ~400ms.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

/** Snap to target once within eps so we don't chase forever in floating point. */
export function dampPrecise(
  current: number,
  target: number,
  lambda: number,
  dt: number,
  eps = 1e-4,
): number {
  const next = damp(current, target, lambda, dt)
  return Math.abs(target - next) < eps ? target : next
}

/** Shortest-arc damp for an angle (radians), so a wrap doesn't spin the long way. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const TWO_PI = Math.PI * 2
  let delta = (target - current) % TWO_PI
  if (delta > Math.PI) delta -= TWO_PI
  if (delta < -Math.PI) delta += TWO_PI
  return current + delta * (1 - Math.exp(-lambda * dt))
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
