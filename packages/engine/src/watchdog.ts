// Behavior watchdog (L6, Phase 7b) — defense-in-depth over the 7a invariant that
// every wait in the solver is individually bounded. This ports the legacy Notebook
// busy-latch + `total + 1500` force-release: if a run overruns its TOTAL time bound,
// the watchdog cancels locomotion, snaps the character to safe idle, and traces a
// `watchdog:forced-release`. Malformed content can therefore NEVER wedge the character.
//
// ── THE PER-RUN LATCH (the legacy lesson, ported) ──────────────────────────────────
// The legacy code guarded its watchdog timer with a `_runId` token so a stale timer
// from an interrupted choreography could not fire on a LATER busy run. Here the same:
// the watchdog keys its elapsed accumulator on the executor's monotonic `runId`. When
// a new behavior starts (runId changes) the accumulator RESETS — an old run's expired
// window can never force-release a newer run. A run is force-released at most ONCE.

import { STEP_MS } from './loop'
import type { EventBus } from './events'

/** The minimal surface the watchdog drives — the CharacterRuntime provides it. */
export interface WatchdogTarget {
  running(): boolean
  /** Monotonic per-run id; changes on each new behavior (the latch key). */
  runId(): number
  /** The current run's total time bound (ms). */
  budgetMs(): number
  /** Force the behavior to safe idle (cancel locomotion, clear the stack, idle). */
  forceRelease(): void
}

export interface WatchdogOptions {
  /** Hard override cap (ms). When set, the run is force-released after this instead of
   * the executor's computed budget — used to prove the force-release path. */
  maxBehaviorMs?: number
  /** Where `watchdog:forced-release` is emitted (usually the character's bus). */
  events?: EventBus
  /** Stamped onto the trace event so multi-character traces stay attributable. */
  characterId?: string
}

export interface Watchdog {
  /** Advance the watchdog by one sim tick — call once per tick alongside runtime.tick(). */
  tick(): void
  /** Serializable state (so a snapshot/restore keeps the watchdog window coherent). */
  getState(): WatchdogState
  setState(s: WatchdogState): void
}

export interface WatchdogState {
  latchRunId: number
  elapsedMs: number
  releasedRunId: number
}

export function createWatchdog(target: WatchdogTarget, opts: WatchdogOptions = {}): Watchdog {
  let latchRunId = -1
  let elapsedMs = 0
  // The runId we have already force-released (fire at most once per run).
  let releasedRunId = -1

  function bound(): number {
    // A hard override cap wins; otherwise the executor's computed total bound.
    return opts.maxBehaviorMs !== undefined ? opts.maxBehaviorMs : target.budgetMs()
  }

  return {
    tick() {
      const rid = target.runId()
      // New run → reset the window (per-run latch: a stale window can't cross runs).
      if (rid !== latchRunId) {
        latchRunId = rid
        elapsedMs = 0
      }
      if (!target.running()) {
        elapsedMs = 0
        return
      }
      elapsedMs += STEP_MS
      if (elapsedMs > bound() && releasedRunId !== rid) {
        releasedRunId = rid
        target.forceRelease()
        opts.events?.emit('watchdog:forced-release', {
          characterId: opts.characterId,
          runId: rid,
          elapsedMs,
          boundMs: bound(),
        })
      }
    },
    getState() {
      return { latchRunId, elapsedMs, releasedRunId }
    },
    setState(s) {
      latchRunId = s.latchRunId
      elapsedMs = s.elapsedMs
      releasedRunId = s.releasedRunId
    },
  }
}
