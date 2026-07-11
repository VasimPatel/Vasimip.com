// @dash/engine — deterministic, DOM-free sim core (loop, context, hash).
// May depend only on @dash/schema (per ENGINE_V2 §3); Phase 1 needs nothing from
// it yet, so this package declares no runtime deps.

export { SIM_HZ, STEP_MS, MAX_TICKS_PER_ADVANCE, createLoop } from './loop'
export type { Loop } from './loop'

export { createRng } from './rng'
export type { Rng } from './rng'

export { createEventBus } from './events'
export type { EventBus, TraceEvent, Listener } from './events'

export { createClock } from './clock'
export type { Clock } from './clock'

export { createContext } from './context'
export type { EngineContext } from './context'

export { serializeState, hashState } from './hash'

export { solveFk } from './fk'
export type { SolvedBone, SolvedSkeleton, SolveFkOptions } from './fk'
