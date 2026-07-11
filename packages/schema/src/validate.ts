// Tiny validator harness. Same ergonomics as the legacy notebook validator
// (src/notebook/doc/validate.ts): checks COLLECT every problem onto a shared
// `Issues` array as plain-English `path: message` strings, rather than throwing
// on the first — so hand-edited docs surface all their mistakes at once.
//
// This is deliberately just the harness idiom + a few primitives; it is NOT a
// copy of the legacy validator's field checkers.

export type Issues = string[]

export type ValidateOk<T> = { ok: true; doc: T }
export type ValidateErr = { ok: false; errors: string[] }
export type ValidateResult<T> = ValidateOk<T> | ValidateErr

// ── primitive check helpers ──────────────────────────────────────────────────

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** A *finite* number (rejects NaN/±Infinity), matching the legacy isFiniteNumber. */
export function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

export function isStr(x: unknown): x is string {
  return typeof x === 'string'
}

export function isBool(x: unknown): x is boolean {
  return typeof x === 'boolean'
}

export function isArr(x: unknown): x is unknown[] {
  return Array.isArray(x)
}

export function inRange(x: number, minIncl: number, maxIncl: number): boolean {
  return x >= minIncl && x <= maxIncl
}

// ── the harness ──────────────────────────────────────────────────────────────

/** A check pushes `path: message` problems onto `issues` for a doc known to be a record. */
export type Check = (doc: Record<string, unknown>, issues: Issues) => void

/**
 * Run `checks` against `doc`, collecting all problems. Returns the narrowed doc
 * on success or the full list of `path: message` errors on failure.
 */
export function tryValidate<T>(doc: unknown, checks: readonly Check[]): ValidateResult<T> {
  if (!isRecord(doc)) return { ok: false, errors: ['doc: must be an object'] }
  const issues: Issues = []
  for (const check of checks) check(doc, issues)
  if (issues.length > 0) return { ok: false, errors: issues }
  return { ok: true, doc: doc as T }
}
