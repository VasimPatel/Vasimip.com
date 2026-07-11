// Event bus with a built-in trace. EVERY emit is appended to the trace stamped
// with the current tick (read via an injected getter, so the bus never touches a
// clock directly). The trace is the substrate the headless replay/Wall-Test
// assertions read.

export interface TraceEvent {
  tick: number
  type: string
  payload: unknown
}

export type Listener = (payload: unknown) => void

export interface EventBus {
  emit(type: string, payload?: unknown): void
  /** Subscribe; returns an unsubscribe function. */
  on(type: string, fn: Listener): () => void
  /** The ordered event trace since creation (live view — do not mutate). */
  trace(): readonly TraceEvent[]
}

export function createEventBus(getTick: () => number): EventBus {
  const listeners = new Map<string, Set<Listener>>()
  const log: TraceEvent[] = []
  return {
    emit(type, payload) {
      log.push({ tick: getTick(), type, payload })
      const set = listeners.get(type)
      if (set) for (const fn of set) fn(payload)
    },
    on(type, fn) {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(fn)
      return () => {
        set.delete(fn)
      }
    },
    trace() {
      return log
    },
  }
}
