// ─────────────────────────────────────────────────────────────────────────────
// BehaviorDoc + Intent + TargetRef (ENGINE_V2 §2 closed verb set, §5 sketch) —
// Phase 7a. A behavior is a sequence of runtime-resolved INTENTS drawn from the
// CLOSED verb set. Movement intents name a TARGET as a symbolic reference resolved
// against the LIVE world at execution time — never raw coordinates (§5: coordinates
// are allowed only as authored rest transforms in WorldDoc).
//
//   BehaviorDoc = { schemaVersion, id, steps: Intent[], reactions?, cues?, when? }
//
// ── SCOPE SPLIT (7a executes / 7b executes / stubbed) ────────────────────────────
// This module TYPES and VALIDATES the whole closed verb set + the reaction/cue/gate
// surface now, so 7b fills in execution without a schema bump (the 6a/6b lesson).
//   • 7a EXECUTES:  idle, moveTo, jumpTo, flyTo, flyThrough, playClip, strikePose,
//                   wait, impulse, setFlag   (execution lives in @dash/engine).
//   • TYPE-ONLY (7a validates, 7b/P9 execute): branchOnFlag (branch), reactions,
//                   cues, when-gates.
//   • STUBBED (7a validates; engine executes to a single trace event, real
//                   performance layer is 7b/P9): say, sfx, camera, emit, attach,
//                   detach.
// Every field outside a verb's documented set is REJECTED (closed schema), exactly
// like world.ts / rules.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { CURRENT_SCHEMA_VERSION, type DocEnvelope } from './envelope'
import {
  tryValidate,
  isRecord,
  isNum,
  isStr,
  isBool,
  isArr,
  type ValidateResult,
  type Issues,
} from './validate'

// ── TargetRef — a symbolic, runtime-resolved reference (never raw coordinates) ────
//
//   'panel:<pid>#roof'      — the roof (top-centre) standable spot of a panel entity
//   'panel:<pid>#interior'  — the interior standable spot (authored anchor) of a panel
//   'entity:<id>'           — an entity's transform position
//   'nearest:surface'       — the nearest standable surface point to the character
//   'node:<traversalNodeId>'— a specific traversal-graph node (e.g. 'panel:0:2:roofL')
//
// The engine resolver validates against the live world at execution time; an
// unresolvable target is an intent FAILURE (a trace event in 7a; give-up reactions
// are 7b). This module validates only the STRING GRAMMAR (cheap, world-free) and,
// via validateBehaviorAgainstWorld, an optional dry existence check.
export type TargetRef = string

/** A bare entity id (the impulse target). Matches the world.ts convention that
 * references are bare strings (RigInstanceComponent.character, etc.). */
export type EntityRef = string

export type ParsedTarget =
  | { kind: 'panelSpot'; panel: string; spot: 'roof' | 'interior' }
  | { kind: 'entity'; entity: string }
  | { kind: 'nearestSurface' }
  | { kind: 'node'; node: string }
  /** Contextual travel ref (P9 grammar EXTENSION, owner sign-off recorded in the
   * 9a PR): resolved against the from/to panels a travel run binds at runtime —
   * the v1 cue compiler's context, made data. */
  | { kind: 'travel'; which: 'to' | 'from'; spot: string }

/** Parse a TargetRef string into its typed shape, or null if the grammar is bad. */
export function parseTargetRef(ref: string): ParsedTarget | null {
  if (typeof ref !== 'string' || ref.length === 0) return null
  if (ref === 'nearest:surface') return { kind: 'nearestSurface' }
  if (ref.startsWith('travel:')) {
    const rest = ref.slice('travel:'.length)
    const hash = rest.indexOf('#')
    const which = hash > 0 ? rest.slice(0, hash) : rest
    const spot = hash > 0 ? rest.slice(hash + 1) : 'interior'
    if ((which === 'to' || which === 'from') && spot.length > 0) return { kind: 'travel', which, spot }
    return null
  }
  if (ref.startsWith('entity:')) {
    const entity = ref.slice('entity:'.length)
    return entity.length > 0 ? { kind: 'entity', entity } : null
  }
  if (ref.startsWith('node:')) {
    const node = ref.slice('node:'.length)
    return node.length > 0 ? { kind: 'node', node } : null
  }
  if (ref.startsWith('panel:')) {
    const rest = ref.slice('panel:'.length)
    const hash = rest.lastIndexOf('#')
    if (hash <= 0) return null
    const panel = rest.slice(0, hash)
    const spot = rest.slice(hash + 1)
    if (spot !== 'roof' && spot !== 'interior') return null
    return { kind: 'panelSpot', panel, spot }
  }
  return null
}

// ── the closed verb set (§2) ─────────────────────────────────────────────────────
export const INTENT_VERBS = [
  'idle',
  'moveTo',
  'jumpTo',
  'flyTo',
  'flyThrough',
  'playClip',
  'strikePose',
  'say',
  'sfx',
  'camera',
  'wait',
  'emit',
  'impulse',
  'attach',
  'detach',
  'setFlag',
  'branchOnFlag',
] as const
export type IntentVerb = (typeof INTENT_VERBS)[number]

/** The four movement verbs — those the locomotion solver executes against geometry. */
export const MOVEMENT_VERBS = ['moveTo', 'jumpTo', 'flyTo', 'flyThrough'] as const
export type MovementVerb = (typeof MOVEMENT_VERBS)[number]

export type MoveIntent = { verb: MovementVerb; target: TargetRef; timeoutMs?: number }

export type Intent =
  | { verb: 'idle' }
  | MoveIntent
  | { verb: 'playClip'; ref: string; blendMs?: number }
  | { verb: 'strikePose'; ref: string; blendMs?: number; holdMs?: number }
  | { verb: 'say'; text: string }
  | { verb: 'sfx'; kind: string }
  | { verb: 'camera'; to?: TargetRef; ms?: number }
  | { verb: 'wait'; ms: number }
  | { verb: 'emit'; emitter: string; count?: number }
  | { verb: 'impulse'; target: EntityRef; vec: [number, number] }
  | { verb: 'attach'; target: EntityRef; point?: string }
  | { verb: 'detach'; target?: EntityRef }
  | { verb: 'setFlag'; flag: string; value?: boolean }
  | { verb: 'branchOnFlag'; flag: string; then: Intent[]; else?: Intent[] }

// ── reactions / cues / gates (TYPED now; 7b executes) ─────────────────────────────

/** Reaction triggers (§2). A reaction is a verb list fired when the trigger event
 * occurs. 7b executes; 7a validates and accepts. */
export const REACTION_TRIGGERS = [
  'onArrive',
  'onBlocked',
  'onLand',
  'onHit',
  'onDisturbed',
  'onTimeout',
  'onProjectileHit',
] as const
export type ReactionTrigger = (typeof REACTION_TRIGGERS)[number]

/** Milestones a performance cue anchors to (§7b: cues fire relative to intent
 * milestones, not absolute time). 7b schedules; 7a validates and accepts. */
export const MILESTONES = ['onLaunch', 'onLand', 'onArrive', 'onBlocked'] as const
export type Milestone = (typeof MILESTONES)[number]

/** The CLOSED performance subset a cue's `do` may use (§7b). Cues run CONCURRENTLY
 * with the ongoing movement, so only performance beats are allowed: a movement verb
 * would re-task the solver mid-move, and a state verb (setFlag / impulse / emit /
 * branchOnFlag / wait / …) would mutate sim state or sequence time from a decorative
 * layer. Validation enforces exactly the set the engine executes — no cue verb is
 * ever accepted-then-silently-ignored. */
export const CUE_VERBS = ['say', 'sfx', 'camera', 'strikePose', 'playClip'] as const
export type CueVerb = (typeof CUE_VERBS)[number]

export interface Cue {
  at: Milestone
  do: Intent
}

/** Minimal boolean gate over the flag store (§5 `when?: GateExpr`). A gate is a
 * flag test or a boolean combination of gates. Evaluated against a character's flag
 * store (7b uses it to gate behavior selection; 7a validates + exposes an evaluator). */
export type GateExpr =
  | { flag: string }
  | { not: GateExpr }
  | { and: GateExpr[] }
  | { or: GateExpr[] }

export interface BehaviorDoc extends DocEnvelope {
  id: string
  steps: Intent[]
  reactions?: Partial<Record<ReactionTrigger, Intent[]>>
  cues?: Cue[]
  when?: GateExpr
}

/** Evaluate a GateExpr against a flag store (missing flag = false). Pure. Exposed so
 * the engine's `when?` check and 7b's selection logic share one implementation. */
export function evalGate(expr: GateExpr, flags: Record<string, boolean>): boolean {
  if ('flag' in expr) return flags[expr.flag] === true
  if ('not' in expr) return !evalGate(expr.not, flags)
  if ('and' in expr) return expr.and.every((e) => evalGate(e, flags))
  if ('or' in expr) return expr.or.some((e) => evalGate(e, flags))
  return false
}

// ── validation (closed verb set + per-verb allowed keys + unknown-key rejection) ──

const VERB_SET: ReadonlySet<string> = new Set(INTENT_VERBS)
const TRIGGER_SET: ReadonlySet<string> = new Set(REACTION_TRIGGERS)
const MILESTONE_SET: ReadonlySet<string> = new Set(MILESTONES)
const MOVEMENT_SET: ReadonlySet<string> = new Set(MOVEMENT_VERBS)
const CUE_VERB_SET: ReadonlySet<string> = new Set(CUE_VERBS)

function rejectUnknownKeys(o: Record<string, unknown>, allowed: readonly string[], path: string, issues: Issues): void {
  const set = new Set(allowed)
  for (const k of Object.keys(o)) if (!set.has(k)) issues.push(`${path}.${k}: unknown field (closed schema)`)
}

/** Allowed fields per verb (closed schema — anything else is rejected). */
const VERB_KEYS: Record<IntentVerb, readonly string[]> = {
  idle: ['verb'],
  moveTo: ['verb', 'target', 'timeoutMs'],
  jumpTo: ['verb', 'target', 'timeoutMs'],
  flyTo: ['verb', 'target', 'timeoutMs'],
  flyThrough: ['verb', 'target', 'timeoutMs'],
  playClip: ['verb', 'ref', 'blendMs'],
  strikePose: ['verb', 'ref', 'blendMs', 'holdMs'],
  say: ['verb', 'text'],
  sfx: ['verb', 'kind'],
  camera: ['verb', 'to', 'ms'],
  wait: ['verb', 'ms'],
  emit: ['verb', 'emitter', 'count'],
  impulse: ['verb', 'target', 'vec'],
  attach: ['verb', 'target', 'point'],
  detach: ['verb', 'target'],
  setFlag: ['verb', 'flag', 'value'],
  branchOnFlag: ['verb', 'flag', 'then', 'else'],
}

function checkTarget(v: unknown, path: string, issues: Issues): void {
  if (!isStr(v) || parseTargetRef(v) === null) {
    issues.push(
      `${path}: must be a TargetRef ('panel:<id>#roof|#interior' | 'entity:<id>' | 'nearest:surface' | 'node:<id>')`,
    )
  }
}

function checkIntent(intent: unknown, path: string, issues: Issues): void {
  if (!isRecord(intent)) return void issues.push(`${path}: must be an object`)
  const verb = intent.verb
  if (!isStr(verb) || !VERB_SET.has(verb)) {
    issues.push(`${path}.verb: must be one of ${INTENT_VERBS.join(', ')}`)
    return
  }
  rejectUnknownKeys(intent, VERB_KEYS[verb as IntentVerb], path, issues)

  switch (verb as IntentVerb) {
    case 'idle':
      break
    case 'moveTo':
    case 'jumpTo':
    case 'flyTo':
    case 'flyThrough':
      checkTarget(intent.target, `${path}.target`, issues)
      if (intent.timeoutMs !== undefined && (!isNum(intent.timeoutMs) || intent.timeoutMs <= 0))
        issues.push(`${path}.timeoutMs: must be a finite number > 0 when present`)
      break
    case 'playClip':
      if (!isStr(intent.ref) || intent.ref.length === 0) issues.push(`${path}.ref: required non-empty string`)
      if (intent.blendMs !== undefined && (!isNum(intent.blendMs) || intent.blendMs < 0))
        issues.push(`${path}.blendMs: must be a finite number >= 0 when present`)
      break
    case 'strikePose':
      if (!isStr(intent.ref) || intent.ref.length === 0) issues.push(`${path}.ref: required non-empty string`)
      if (intent.blendMs !== undefined && (!isNum(intent.blendMs) || intent.blendMs < 0))
        issues.push(`${path}.blendMs: must be a finite number >= 0 when present`)
      if (intent.holdMs !== undefined && (!isNum(intent.holdMs) || intent.holdMs < 0))
        issues.push(`${path}.holdMs: must be a finite number >= 0 when present`)
      break
    case 'say':
      if (!isStr(intent.text)) issues.push(`${path}.text: required string`)
      break
    case 'sfx':
      if (!isStr(intent.kind) || intent.kind.length === 0) issues.push(`${path}.kind: required non-empty string`)
      break
    case 'camera':
      if (intent.to !== undefined) checkTarget(intent.to, `${path}.to`, issues)
      if (intent.ms !== undefined && (!isNum(intent.ms) || intent.ms < 0))
        issues.push(`${path}.ms: must be a finite number >= 0 when present`)
      break
    case 'wait':
      if (!isNum(intent.ms) || intent.ms < 0) issues.push(`${path}.ms: required finite number >= 0`)
      break
    case 'emit':
      if (!isStr(intent.emitter) || intent.emitter.length === 0) issues.push(`${path}.emitter: required non-empty string`)
      if (intent.count !== undefined && (!isNum(intent.count) || intent.count < 0 || !Number.isInteger(intent.count)))
        issues.push(`${path}.count: must be a non-negative integer when present`)
      break
    case 'impulse':
      if (!isStr(intent.target) || intent.target.length === 0) issues.push(`${path}.target: required non-empty entity id`)
      if (!isArr(intent.vec) || intent.vec.length !== 2 || !isNum(intent.vec[0]) || !isNum(intent.vec[1]))
        issues.push(`${path}.vec: required [number, number]`)
      break
    case 'attach':
      if (!isStr(intent.target) || intent.target.length === 0) issues.push(`${path}.target: required non-empty entity id`)
      if (intent.point !== undefined && !isStr(intent.point)) issues.push(`${path}.point: must be a string when present`)
      break
    case 'detach':
      if (intent.target !== undefined && (!isStr(intent.target) || intent.target.length === 0))
        issues.push(`${path}.target: must be a non-empty entity id when present`)
      break
    case 'setFlag':
      if (!isStr(intent.flag) || intent.flag.length === 0) issues.push(`${path}.flag: required non-empty string`)
      if (intent.value !== undefined && !isBool(intent.value)) issues.push(`${path}.value: must be a boolean when present`)
      break
    case 'branchOnFlag':
      if (!isStr(intent.flag) || intent.flag.length === 0) issues.push(`${path}.flag: required non-empty string`)
      if (!isArr(intent.then)) issues.push(`${path}.then: required array of intents`)
      else intent.then.forEach((s, i) => checkIntent(s, `${path}.then[${i}]`, issues))
      if (intent.else !== undefined) {
        if (!isArr(intent.else)) issues.push(`${path}.else: must be an array of intents when present`)
        else intent.else.forEach((s, i) => checkIntent(s, `${path}.else[${i}]`, issues))
      }
      break
  }
}

/** Validate a single intent (the closed verb set + per-verb keys). Exported so the
 * CharacterDoc default-reactions and the RuleRow `intent` response validate intents
 * with the SAME rules as behavior steps (one source of truth for the verb set). */
export function checkIntentValue(intent: unknown, path: string, issues: Issues): void {
  checkIntent(intent, path, issues)
}

/** Validate a `Partial<Record<ReactionTrigger, Intent[]>>` block (behavior- or
 * character-level). Shared by BehaviorDoc.reactions and CharacterDoc.reactions. */
export function checkReactions(reactions: unknown, base: string, issues: Issues): void {
  if (!isRecord(reactions)) return void issues.push(`${base}: must be an object`)
  for (const [trig, list] of Object.entries(reactions)) {
    if (!TRIGGER_SET.has(trig)) issues.push(`${base}.${trig}: unknown trigger (closed set: ${REACTION_TRIGGERS.join(', ')})`)
    if (!isArr(list)) issues.push(`${base}.${trig}: must be an array of intents`)
    else list.forEach((s, i) => checkIntent(s, `${base}.${trig}[${i}]`, issues))
  }
}

const GATE_KEYS = ['flag', 'not', 'and', 'or'] as const
function checkGate(g: unknown, path: string, issues: Issues): void {
  if (!isRecord(g)) return void issues.push(`${path}: must be an object`)
  const keys = Object.keys(g)
  if (keys.length !== 1 || !GATE_KEYS.includes(keys[0] as (typeof GATE_KEYS)[number])) {
    issues.push(`${path}: must have exactly one of ${GATE_KEYS.join(' | ')}`)
    return
  }
  if ('flag' in g) {
    if (!isStr(g.flag) || g.flag.length === 0) issues.push(`${path}.flag: required non-empty string`)
  } else if ('not' in g) {
    checkGate(g.not, `${path}.not`, issues)
  } else if ('and' in g) {
    if (!isArr(g.and) || g.and.length === 0) issues.push(`${path}.and: required non-empty array`)
    else g.and.forEach((e, i) => checkGate(e, `${path}.and[${i}]`, issues))
  } else if ('or' in g) {
    if (!isArr(g.or) || g.or.length === 0) issues.push(`${path}.or: required non-empty array`)
    else g.or.forEach((e, i) => checkGate(e, `${path}.or[${i}]`, issues))
  }
}

const BEHAVIOR_KEYS = ['schemaVersion', 'id', 'steps', 'reactions', 'cues', 'when'] as const

export function tryValidateBehavior(doc: unknown): ValidateResult<BehaviorDoc> {
  return tryValidate<BehaviorDoc>(doc, [
    (d, issues) => {
      if (d.schemaVersion !== CURRENT_SCHEMA_VERSION)
        issues.push(`schemaVersion: must be ${CURRENT_SCHEMA_VERSION}`)
      rejectUnknownKeys(d, BEHAVIOR_KEYS, 'behavior', issues)
      if (!isStr(d.id) || d.id.length === 0) issues.push('id: required non-empty string')

      if (!isArr(d.steps)) issues.push('steps: required array')
      else d.steps.forEach((s, i) => checkIntent(s, `steps[${i}]`, issues))

      if (d.reactions !== undefined) checkReactions(d.reactions, 'reactions', issues)

      if (d.cues !== undefined) {
        if (!isArr(d.cues)) issues.push('cues: must be an array')
        else
          d.cues.forEach((c, i) => {
            const path = `cues[${i}]`
            if (!isRecord(c)) return void issues.push(`${path}: must be an object`)
            rejectUnknownKeys(c, ['at', 'do'], path, issues)
            if (!isStr(c.at) || !MILESTONE_SET.has(c.at)) issues.push(`${path}.at: must be one of ${MILESTONES.join(', ')}`)
            checkIntent(c.do, `${path}.do`, issues)
            // A cue is a PERFORMANCE beat run CONCURRENTLY with the movement (§7b):
            // its verb must come from the closed performance subset. Movement verbs
            // get the specific message (the most likely authoring mistake); any other
            // non-performance verb (setFlag/impulse/…) is rejected as well — the
            // engine executes exactly CUE_VERBS, never accept-then-ignore.
            if (isRecord(c.do) && isStr(c.do.verb) && VERB_SET.has(c.do.verb) && !CUE_VERB_SET.has(c.do.verb)) {
              if (MOVEMENT_SET.has(c.do.verb))
                issues.push(`${path}.do: a cue may not be a movement verb (${MOVEMENT_VERBS.join(', ')}) — cues run concurrently with movement`)
              else
                issues.push(`${path}.do: cue verb must be a performance verb (${CUE_VERBS.join(', ')})`)
            }
          })
      }

      if (d.when !== undefined) checkGate(d.when, 'when', issues)
    },
  ])
}

/** Cheap dry validation against a live world: every panel/entity/node TargetRef in
 * the movement steps must resolve to something the world contains. `entityIds` and
 * `nodeIds` are the live-world id sets; omit a set to skip that check. Symbolic-only
 * (`nearest:surface`) always passes. Returns issues (empty = ok). */
export function validateBehaviorAgainstWorld(
  behavior: BehaviorDoc,
  world: { entityIds?: ReadonlySet<string>; nodeIds?: ReadonlySet<string> },
): ValidateResult<BehaviorDoc> {
  const issues: Issues = []
  const checkRef = (ref: string, path: string): void => {
    const t = parseTargetRef(ref)
    if (t === null) return void issues.push(`${path}: malformed TargetRef`)
    if (t.kind === 'panelSpot' && world.entityIds && !world.entityIds.has(t.panel))
      issues.push(`${path}: panel '${t.panel}' not in world`)
    if (t.kind === 'entity' && world.entityIds && !world.entityIds.has(t.entity))
      issues.push(`${path}: entity '${t.entity}' not in world`)
    if (t.kind === 'node' && world.nodeIds && !world.nodeIds.has(t.node))
      issues.push(`${path}: node '${t.node}' not in graph`)
  }
  const walk = (steps: Intent[], base: string): void => {
    steps.forEach((s, i) => {
      const path = `${base}[${i}]`
      if (s.verb === 'moveTo' || s.verb === 'jumpTo' || s.verb === 'flyTo' || s.verb === 'flyThrough')
        checkRef(s.target, `${path}.target`)
      if (s.verb === 'branchOnFlag') {
        walk(s.then, `${path}.then`)
        if (s.else) walk(s.else, `${path}.else`)
      }
    })
  }
  walk(behavior.steps, 'steps')
  return issues.length > 0 ? { ok: false, errors: issues } : { ok: true, doc: behavior }
}
