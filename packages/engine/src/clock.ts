// Sim clock. Time is derived PURELY from the integer tick count — there is no
// wall clock anywhere in the engine (Date.now / performance.now are lint-banned).
// simTimeMs is a pure function of ticks, so it replays identically.

export interface Clock {
  readonly tick: number
  readonly simTimeMs: number
  /** Advance exactly one sim step. */
  advance(): void
  /** Restore the tick counter (snapshot/replay only — NOT a wall clock read). */
  setTick(tick: number): void
}

export function createClock(stepMs: number): Clock {
  let tick = 0
  return {
    get tick() {
      return tick
    },
    get simTimeMs() {
      return tick * stepMs
    },
    advance() {
      tick++
    },
    setTick(t: number) {
      tick = t
    },
  }
}
