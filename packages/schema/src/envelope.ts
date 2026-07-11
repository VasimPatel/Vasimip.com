// Document envelope + version constant. Every v2 doc intersects DocEnvelope so a
// validator can dispatch on `schemaVersion` before trusting anything else.
//
// v1 is the legacy notebook.json (modeled by src/notebook/doc — NOT here). This
// package starts at v2; it does not model v1 yet (a Phase 9 migration will).

export const CURRENT_SCHEMA_VERSION = 2

/** Intersection base for all v2 docs: `MyDoc = DocEnvelope & { ... }`. */
export type DocEnvelope = { schemaVersion: number }
