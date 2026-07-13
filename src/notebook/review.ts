// Review-only determinism surface (the parity laboratory, Stage 1).
//
// The parity harness must run the SAME performance in both routes: same travel
// verb, same variant rolls (trip/hang/peek/surf), same fidget, same quip line,
// same back-nav kind. Both routes pick those with bare Math.random(); this module
// funnels every such choice through one helper that a review driver can seed and
// force via `window.__dashReview`. Without the hook installed, behavior is
// EXACTLY what it was (Math.random pick) — real visitors never see this surface.
//
// Install shape (set BEFORE the notebook mounts):
//   window.__dashReview = {
//     seed: 7,                          // engine RNG seed (engine route)
//     force: {                          // per-choice overrides, by key
//       'travel.mode': 'vault',         //   value must be one of the options
//       'vault.peek': true,             //   chance() gates take booleans
//       'fidget.kind': 'chat',
//       'fidget.delayMs': 3000,         //   scalar overrides
//     },
//     log: [],                          // both routes push timeline entries here
//   }

export interface ReviewHook {
  seed?: number
  force?: Record<string, string | number | boolean>
  /** Normalized timeline: both routes push { t, route, kind, data } entries. */
  log?: Array<{ t: number; route: 'engine' | 'legacy'; kind: string; data?: unknown }>
}

declare global {
  interface Window {
    __dashReview?: ReviewHook
  }
}

export function reviewHook(): ReviewHook | null {
  return typeof window !== 'undefined' ? (window.__dashReview ?? null) : null
}

// The route this window is running (each route loads in its own page, so one
// module instance == one route). Notebook stamps it on mount; 'engine' default.
let currentRoute: 'engine' | 'legacy' = 'engine'
export function setReviewRoute(route: 'engine' | 'legacy'): void {
  currentRoute = route
}

/** Pick one of `options`, honoring a forced value under `key` when the review hook
 * is installed. Forcing matches by String() equality first, then by index. Every
 * choice (forced or rolled) lands on the review timeline. */
export function pick<T>(key: string, options: readonly T[]): T {
  const f = reviewHook()?.force?.[key]
  let out: T
  if (f !== undefined) {
    const byVal = options.find((o) => String(o) === String(f))
    if (byVal !== undefined) out = byVal
    else {
      const i = Number(f)
      out = Number.isInteger(i) && i >= 0 && i < options.length ? options[i] : options[0]
    }
  } else {
    out = options[Math.floor(Math.random() * options.length)]
  }
  reviewLog(currentRoute, 'pick', { key, value: String(out) })
  return out
}

/** A probability gate (`Math.random() < p`), forceable to true/false under `key`. */
export function chance(key: string, p: number): boolean {
  const f = reviewHook()?.force?.[key]
  const out = f !== undefined ? f === true || f === 'true' || f === 1 : Math.random() < p
  reviewLog(currentRoute, 'chance', { key, pass: out })
  return out
}

/** A scalar (e.g. a scheduler delay), forceable under `key`. */
export function scalar(key: string, real: () => number): number {
  const f = reviewHook()?.force?.[key]
  if (f !== undefined && Number.isFinite(Number(f))) return Number(f)
  return real()
}

/** Push a normalized timeline entry when the hook is recording. Cheap no-op
 * otherwise (one property read). `t` is performance.now() — wall-clock alignment
 * happens in the harness, which owns both routes' clocks. */
export function reviewLog(route: 'engine' | 'legacy', kind: string, data?: unknown): void {
  const h = reviewHook()
  if (!h?.log) return
  h.log.push({ t: Math.round(performance.now()), route, kind, data })
}
