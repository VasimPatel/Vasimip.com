// @dash/headless — the stable, browser-free outward surface (grows into the
// simulate/replay API in Phase 8). Depends on @dash/engine + @dash/schema.

export { createSim } from './sim'
export type { Sim, Input, ImpulseInput, SimSnapshot } from './sim'

// validate(doc) is re-exported from schema so callers have one entry point. In
// Phase 1 the only doc type is WorldDocV2; this alias broadens in later phases.
export { tryValidateWorldV2 as validate } from '@dash/schema'
