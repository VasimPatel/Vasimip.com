// EngineContext — the deterministic services every layer threads through: the
// seeded RNG, the traced event bus, and the tick-derived clock. Assembling them
// here keeps the wiring (bus reads tick from clock) in one place.

import { createRng, type Rng } from './rng'
import { createEventBus, type EventBus } from './events'
import { createClock, type Clock } from './clock'
import { STEP_MS } from './loop'

export interface EngineContext {
  rng: Rng
  events: EventBus
  clock: Clock
}

export function createContext(opts: { seed: number; stepMs?: number }): EngineContext {
  const clock = createClock(opts.stepMs ?? STEP_MS)
  const events = createEventBus(() => clock.tick)
  const rng = createRng(opts.seed)
  return { rng, events, clock }
}
