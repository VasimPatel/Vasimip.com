// Fixed-timestep simulation loop (accumulator pattern, ENGINE_V2 §3 rule 1).
// The sim always advances in whole 1/120 s steps; render interpolation uses the
// leftover `alpha`. Nothing here reads a wall clock — the caller passes the
// elapsed time it measured.

export const SIM_HZ = 120
export const STEP_MS = 1000 / SIM_HZ

// Clamp on ticks simulated per advance() call. After a long stall (tab sleep,
// debugger pause) the accumulator can hold seconds of backlog; running it all at
// once would freeze the thread (the classic "spiral of death"). Instead we run at
// most MAX_TICKS_PER_ADVANCE steps and DROP the surplus backlog — sim time skips
// forward rather than the app hanging. 300 ticks = 2.5 s of sim at 120 Hz.
export const MAX_TICKS_PER_ADVANCE = 300

export interface Loop {
  /**
   * Feed elapsed wall time (ms) measured by the caller. Runs as many fixed steps
   * as have accumulated (clamped, see MAX_TICKS_PER_ADVANCE) and returns how many
   * ticks ran plus the interpolation alpha (leftover / step) in [0, 1).
   */
  advance(elapsedMs: number): { ticks: number; alpha: number }
}

export function createLoop(tick: () => void, opts?: { stepMs?: number; maxTicks?: number }): Loop {
  const stepMs = opts?.stepMs ?? STEP_MS
  const maxTicks = opts?.maxTicks ?? MAX_TICKS_PER_ADVANCE
  let acc = 0
  return {
    advance(elapsedMs) {
      if (elapsedMs > 0) acc += elapsedMs
      let ticks = 0
      while (acc >= stepMs && ticks < maxTicks) {
        tick()
        acc -= stepMs
        ticks++
      }
      // Hit the clamp with backlog remaining: discard it (keep only the fractional
      // remainder) so alpha stays in [0, 1) and we don't re-run it next call.
      if (acc >= stepMs) acc = acc % stepMs
      return { ticks, alpha: acc / stepMs }
    },
  }
}
