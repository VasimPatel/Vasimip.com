// validate(doc) — the single stable validation entry point. Dispatches by the doc's
// SHAPE (discriminant top-level keys) to the right @dash/schema validator, then
// returns a uniform { ok, errors?, kind } (JSON-pure — no narrowed doc, so it maps
// 1:1 onto an MCP tool result). This is the surface the server /api/validate calls.
//
// ── DISPATCH RULES (a doc must match EXACTLY ONE discriminant — P8 review) ──────────
//   entities: []        → 'world'      (WorldDocV2)          tryValidateWorldV2
//   steps: []           → 'behavior'   (BehaviorDoc)         tryValidateBehavior
//   joints: []          → 'rig'        (RigTemplate)         tryValidateRig
//   tracks: []          → 'clip'       (Clip)                tryValidateClip
//   rows: []            → 'ruleTable'  (RuleTableDoc)        tryValidateRuleTable
//   angles: {}          → 'pose'       (Pose)                tryValidatePose
//   personality:{} OR   → 'character'  (CharacterDoc)        tryValidateCharacter
//     (rig:str & locomotion:{})
//   0 matches           → 'unknown' → { ok:false } (recognized-shapes error)
//   2+ matches          → 'unknown' → { ok:false } (AMBIGUOUS — never first-match: a
//                         doc carrying entities[] AND steps[] is an error, not a
//                         world). Belt-and-braces with each validator's closed
//                         top-level keys (e.g. tryValidateWorldV2 rejects `steps`).
//
// Pose/clip here run their STANDALONE (structure-only) validators; validating a pose
// or clip against a specific rig needs the rig in hand and is out of this dispatcher's
// scope (a later phase's concern once rig+content travel together).

import {
  isRecord,
  isArr,
  isStr,
  tryValidateWorldV2,
  tryValidateBehavior,
  tryValidateRig,
  tryValidateCharacter,
  tryValidatePose,
  tryValidateClip,
  tryValidateRuleTable,
  type ValidateResult,
} from '@dash/schema'

export type DocKind = 'world' | 'behavior' | 'rig' | 'clip' | 'ruleTable' | 'pose' | 'character' | 'unknown'

export interface ValidateDispatch {
  ok: boolean
  kind: DocKind
  errors?: string[]
}

type Rec = Record<string, unknown>

/** Discriminant predicates, one per doc kind (order = documentation order only). */
const DISCRIMINANTS: { kind: Exclude<DocKind, 'unknown'>; match: (d: Rec) => boolean }[] = [
  { kind: 'world', match: (d) => isArr(d.entities) },
  { kind: 'behavior', match: (d) => isArr(d.steps) },
  { kind: 'rig', match: (d) => isArr(d.joints) },
  { kind: 'clip', match: (d) => isArr(d.tracks) },
  { kind: 'ruleTable', match: (d) => isArr(d.rows) },
  { kind: 'pose', match: (d) => isRecord(d.angles) },
  { kind: 'character', match: (d) => isRecord(d.personality) || (isStr(d.rig) && isRecord(d.locomotion)) },
]

const VALIDATORS: Record<Exclude<DocKind, 'unknown'>, (doc: unknown) => ValidateResult<unknown>> = {
  world: tryValidateWorldV2,
  behavior: tryValidateBehavior,
  rig: tryValidateRig,
  clip: tryValidateClip,
  ruleTable: tryValidateRuleTable,
  pose: tryValidatePose,
  character: tryValidateCharacter,
}

export function validate(doc: unknown): ValidateDispatch {
  const matches = isRecord(doc) ? DISCRIMINANTS.filter((d) => d.match(doc)) : []

  if (matches.length === 0) {
    return {
      ok: false,
      kind: 'unknown',
      errors: [
        'doc: unrecognized shape — expected a known v2 doc with exactly one of these discriminants: entities[] (world), steps[] (behavior), joints[] (rig), tracks[] (clip), rows[] (rule table), angles{} (pose), personality{} (character)',
      ],
    }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      kind: 'unknown',
      errors: [
        `doc: ambiguous shape — matches ${matches.length} doc kinds (${matches.map((m) => m.kind).join(', ')}); a doc must carry exactly one discriminant`,
      ],
    }
  }

  const kind = matches[0].kind
  const r = VALIDATORS[kind](doc)
  return r.ok ? { ok: true, kind } : { ok: false, kind, errors: r.errors }
}
