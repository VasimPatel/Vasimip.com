// @dash/headless — the STABLE, browser-free, JSON-in/JSON-out outward surface.
// These three functions (+ their input/output types) ARE the substrate a future MCP
// tool wraps 1:1 (ENGINE_V2 Phase 8). Keep the surface small; full docs live in
// docs/engine-v2/headless-api.md. Depends on @dash/engine + @dash/schema.

export { validate } from './validate'
export type { DocKind, ValidateDispatch } from './validate'

export {
  simulate,
  DEFAULT_MAX_TICKS,
  HARD_MAX_TICKS,
  MAX_ENTITIES,
  MAX_SEGMENTS_PER_ENTITY,
  MAX_CHARACTERS,
  MAX_BEHAVIORS,
  MAX_BEHAVIOR_STEPS,
  MAX_LIBRARY_DOCS,
} from './simulate'
export type {
  SimulateInput,
  SimulateResult,
  SimulateOptions,
  CharacterSpec,
  CharacterNames,
  FinalState,
  Outcome,
} from './simulate'

export { replay } from './replay'
export type { ReplayExpected, ReplayResult, ReplayDivergence } from './replay'

// ── DEMOTED — Phase 1 placeholder (NOT part of the stable / MCP surface) ─────────────
// createSim is the P1 random-walk determinism scaffold. It is retained ONLY so the
// P1 replay/snapshot determinism gates (test/replay.test.ts, test/snapshot.test.ts)
// keep running; it is deliberately absent from docs/engine-v2/headless-api.md. New
// callers use simulate() above. It will be removed when those gates fold into the
// simulate()-based acceptance suite.
export { createSim } from './sim'
export type { Sim, Input, ImpulseInput, SimSnapshot } from './sim'
