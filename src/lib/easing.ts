/**
 * Motion has mass, never bounce (brief §5). These are the ONLY eases the
 * descent is allowed to use. The flicker of the flame is the only fast motion
 * on the whole site, and it lives on its own useFrame, not here.
 */

export const EASE = {
  /** a cover/leaf accelerating as it falls under gravity */
  fall: 'power3.in',
  /** the short settle after the fall — a thud, not a spring */
  settle: 'power2.out',
  /** light/mood crossfades between depths */
  mood: 'power2.inOut',
  /** a heavy page turning */
  turn: 'power3.inOut',
} as const

export type EaseName = (typeof EASE)[keyof typeof EASE]

/**
 * Banned everywhere. Anything that overshoots or springs betrays the weight.
 * A test (src/lib/easing.guard.test reference) and code review reject these.
 */
export const BANNED_EASE_SUBSTRINGS = ['back', 'elastic', 'bounce'] as const

/** Guard used in dev to catch a smuggled-in bouncy ease. */
export function assertWeightedEase(ease: string): string {
  const lower = ease.toLowerCase()
  for (const banned of BANNED_EASE_SUBSTRINGS) {
    if (lower.includes(banned)) {
      throw new Error(
        `[codex] ease "${ease}" overshoots — the descent has mass, not bounce. Use one of EASE.{fall,settle,mood,turn}.`,
      )
    }
  }
  return ease
}
