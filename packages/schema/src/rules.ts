// ─────────────────────────────────────────────────────────────────────────────
// Interaction rule table as data (ENGINE_V2 §2 rule rows, §5 RuleRow sketch) —
// Phase 6b. A rule table is `{ rows: RuleRow[] }`; each row pairs two component
// KINDS with an event and lists the world-layer RESPONSES to run on a match.
//
// ── DEVIATION FROM §5 (flagged for orchestrator sign-off) ────────────────────────
// §5 sketches `RuleRow.responses: Intent[]`. Intents are the P7 behavior verb set
// (moveTo/say/emit/…) and belong to the L6 dispatcher, which does not exist yet.
// 6b defines the CLOSED, WORLD-LAYER subset `WorldResponse` — the four effects the
// L5 world can execute against the 6a primitives with no behavior runtime:
//   cut | impulse | support | emitEvent
// This is a REFINEMENT, not a redesign: P7's reaction dispatcher will EXTEND
// responses to full intents (a WorldResponse is then one intent kind among many),
// consuming this same table. The closed set is enforced by the validator below.
// ─────────────────────────────────────────────────────────────────────────────

import { tryValidate, isRecord, isNum, isStr, isArr, type ValidateResult, type Issues } from './validate'
import { COMPONENT_NAMES, type ComponentName, type HoleEdge, type HolePersistScope } from './world'
import { checkIntentValue, type Intent } from './behavior'

/** Rule rows key on component KINDS (the closed component set, §2). */
export type ComponentKind = ComponentName

/** The response set. `cut | impulse | support | emitEvent` are the closed WORLD-LAYER
 * effects (6b). Phase 7b adds `intent` — a FULL behavior intent targeted at the
 * involved character (the §5 sketch's `responses: Intent[]`, realized now that the
 * L6 dispatcher exists). This is the sanctioned extension the 6b deviation note
 * promised: a WorldResponse is one intent kind among many. */
export const WORLD_RESPONSE_KINDS = ['cut', 'impulse', 'support', 'emitEvent', 'intent'] as const
export type WorldResponseKind = (typeof WORLD_RESPONSE_KINDS)[number]

export type WorldResponse =
  /** Cut a hole at the contact, mapped to the nearest edge interval. `edge`/`width`
   * override the impact-derived defaults; heal fields override the panel policy. */
  | { kind: 'cut'; edge?: HoleEdge; width?: number; healAfterMs?: number; persistScope?: HolePersistScope }
  /** Impulse the disturbable body. `vec` is an explicit velocity (px/s, +y DOWN,
   * P5 convention); `scale` scales the impact-derived direction when `vec` is absent. */
  | { kind: 'impulse'; vec?: [number, number]; scale?: number }
  /** Stand/rest resolution: the mover is supported by the surface (uses `stopAt`). */
  | { kind: 'support' }
  /** Emit a named event on the bus (e.g. the character×wall→`blocked` row). */
  | { kind: 'emitEvent'; event: string }
  /** Run a full behavior intent on the involved (non-surface) character — the L6
   * dispatch extension (§7b #4). The engine dispatcher emits a `rule:intent` action
   * the character runtime picks up as a one-shot reaction. */
  | { kind: 'intent'; do: Intent }

export interface RuleRow {
  a: ComponentKind
  b: ComponentKind
  event: string
  responses: WorldResponse[]
}

export interface RuleTableDoc {
  rows: RuleRow[]
}

// ── validation (closed component set + closed response set) ───────────────────────

const KIND_SET: ReadonlySet<string> = new Set(COMPONENT_NAMES)
const RESPONSE_SET: ReadonlySet<string> = new Set(WORLD_RESPONSE_KINDS)
const PERSIST_SET: ReadonlySet<string> = new Set(['none', 'session', 'saved'])
const EDGE_SET: ReadonlySet<string> = new Set(['roof', 'wallL', 'wallR', 'bottom', 'floorIn'])

/** Closed schema: any field outside `allowed` is rejected. */
function rejectUnknownKeys(o: Record<string, unknown>, allowed: readonly string[], path: string, issues: Issues): void {
  const set = new Set(allowed)
  for (const k of Object.keys(o)) if (!set.has(k)) issues.push(`${path}.${k}: unknown field (closed schema)`)
}

/** Allowed fields per response kind (closed schema — unknown fields rejected). */
const RESPONSE_KEYS: Record<WorldResponseKind, readonly string[]> = {
  cut: ['kind', 'edge', 'width', 'healAfterMs', 'persistScope'],
  impulse: ['kind', 'vec', 'scale'],
  support: ['kind'],
  emitEvent: ['kind', 'event'],
  intent: ['kind', 'do'],
}

function checkResponse(r: unknown, path: string, issues: Issues): void {
  if (!isRecord(r)) return void issues.push(`${path}: must be an object`)
  if (!isStr(r.kind) || !RESPONSE_SET.has(r.kind)) {
    issues.push(`${path}.kind: must be one of ${WORLD_RESPONSE_KINDS.join(', ')}`)
    return
  }
  rejectUnknownKeys(r, RESPONSE_KEYS[r.kind as WorldResponseKind], path, issues)
  if (r.kind === 'cut') {
    if (r.edge !== undefined && (!isStr(r.edge) || !EDGE_SET.has(r.edge))) issues.push(`${path}.edge: must be a HoleEdge`)
    if (r.width !== undefined && (!isNum(r.width) || r.width <= 0)) issues.push(`${path}.width: must be a finite number > 0 when present`)
    if (r.healAfterMs !== undefined && (!isNum(r.healAfterMs) || r.healAfterMs < 0)) issues.push(`${path}.healAfterMs: must be a finite number >= 0 when present`)
    if (r.persistScope !== undefined && (!isStr(r.persistScope) || !PERSIST_SET.has(r.persistScope))) issues.push(`${path}.persistScope: must be 'none' | 'session' | 'saved'`)
  } else if (r.kind === 'impulse') {
    if (r.vec !== undefined) {
      if (!isArr(r.vec) || r.vec.length !== 2 || !isNum(r.vec[0]) || !isNum(r.vec[1])) issues.push(`${path}.vec: must be [number, number] when present`)
    }
    if (r.scale !== undefined && !isNum(r.scale)) issues.push(`${path}.scale: must be a finite number when present`)
  } else if (r.kind === 'emitEvent') {
    if (!isStr(r.event) || r.event.length === 0) issues.push(`${path}.event: required non-empty string`)
  } else if (r.kind === 'intent') {
    checkIntentValue(r.do, `${path}.do`, issues)
  }
  // 'support' carries no fields beyond `kind`.
}

function checkRow(row: unknown, path: string, issues: Issues): void {
  if (!isRecord(row)) return void issues.push(`${path}: must be an object`)
  rejectUnknownKeys(row, ['a', 'b', 'event', 'responses'], path, issues)
  for (const k of ['a', 'b'] as const) {
    if (!isStr(row[k]) || !KIND_SET.has(row[k])) issues.push(`${path}.${k}: must be a component kind (closed set: ${COMPONENT_NAMES.join(', ')})`)
  }
  if (!isStr(row.event) || row.event.length === 0) issues.push(`${path}.event: required non-empty string`)
  if (!isArr(row.responses)) issues.push(`${path}.responses: required array`)
  else row.responses.forEach((r, i) => checkResponse(r, `${path}.responses[${i}]`, issues))
}

export function tryValidateRuleTable(doc: unknown): ValidateResult<RuleTableDoc> {
  return tryValidate<RuleTableDoc>(doc, [
    (d, issues) => {
      if (!isArr(d.rows)) return void issues.push('rows: required array')
      d.rows.forEach((row, i) => checkRow(row, `rows[${i}]`, issues))
    },
  ])
}
