// CharacterDoc (L0 instance) — a rig reference plus per-instance overrides:
// proportions (bone-length scalars), stroke style, palette, personality params
// (0..1; PLUMBED now, consumed by controllers in P4/P5), and locomotion
// capabilities (modes + numeric caps; PLUMBED now, consumed by the P6 traversal
// graph). REAL Phase 2 schema (ENGINE_V2 §5); not folded into WorldDocV2 yet (P6).

import { tryValidate, isRecord, isNum, isStr, isArr, inRange, type ValidateResult, type Issues, type Check } from './validate'
import { checkReactions, type ReactionTrigger, type Intent } from './behavior'

export interface StrokeStyle {
  color: string
  width: number
  linecap?: 'round' | 'butt'
}

export interface PersonalityParams {
  energy: number
  bounciness: number
  confidence: number
  sloppiness: number
}

export type LocomotionMode = 'walk' | 'hop' | 'fly'

export interface LocomotionCaps {
  modes: LocomotionMode[]
  maxJumpHeight?: number
  maxJumpDistance?: number
  flySpeed?: number
}

export interface CharacterDoc {
  id: string
  /** RigTemplate id this character instances. */
  rig: string
  /** jointId → bone-length scalar (default 1). */
  proportions?: Record<string, number>
  style?: StrokeStyle
  palette?: Record<string, string>
  personality: PersonalityParams
  locomotion: LocomotionCaps
  accessoryPoints?: string[]
  /** SCHEMA DELTA (Phase 7b): character-level DEFAULT reactions. Consulted by the
   * behavior runtime when the running behavior has no reaction for a trigger —
   * behavior-level reactions always win (§7b authoring contract). Same closed
   * trigger set + intent verb set as BehaviorDoc.reactions. */
  reactions?: Partial<Record<ReactionTrigger, Intent[]>>
}

const PERSONALITY_KEYS = ['energy', 'bounciness', 'confidence', 'sloppiness'] as const
const LOCOMOTION_MODES = new Set(['walk', 'hop', 'fly'])

function checkPersonality(x: unknown, issues: Issues): void {
  if (!isRecord(x)) {
    issues.push('personality: required object {energy, bounciness, confidence, sloppiness}')
    return
  }
  for (const k of PERSONALITY_KEYS) {
    const v = x[k]
    if (!isNum(v)) issues.push(`personality.${k}: required number in 0..1`)
    else if (!inRange(v, 0, 1)) issues.push(`personality.${k}: must be within 0..1, got ${v}`)
  }
}

/** Numeric caps must be POSITIVE and BOUNDED (P7a hardening): a zero flySpeed
 * validates as "can fly" but never moves — a guaranteed runtime wedge; an absurd
 * speed teleports past waypoints. The bound is generous (whole-page scale is ~1000px). */
const CAP_MAX = 5000

function checkLocomotion(x: unknown, issues: Issues): void {
  if (!isRecord(x)) {
    issues.push('locomotion: required object {modes, ...}')
    return
  }
  let modes: string[] = []
  if (!isArr(x.modes) || x.modes.length === 0) {
    issues.push('locomotion.modes: required non-empty array')
  } else {
    x.modes.forEach((m, i) => {
      if (!isStr(m) || !LOCOMOTION_MODES.has(m)) issues.push(`locomotion.modes[${i}]: must be 'walk' | 'hop' | 'fly'`)
    })
    modes = x.modes.filter(isStr)
  }
  for (const k of ['maxJumpHeight', 'maxJumpDistance', 'flySpeed'] as const) {
    if (x[k] !== undefined && (!isNum(x[k]) || (x[k] as number) <= 0 || (x[k] as number) > CAP_MAX)) {
      issues.push(`locomotion.${k}: must be a finite number in (0, ${CAP_MAX}] when present`)
    }
  }
  // Mode ⇒ caps coherence: declaring a mode without the caps it runs on is a
  // runtime wedge waiting to happen (the P7 solver would fall back to defaults the
  // author never chose).
  if (modes.includes('fly') && x.flySpeed === undefined) {
    issues.push("locomotion.flySpeed: required when modes includes 'fly'")
  }
  if (modes.includes('hop') && (x.maxJumpHeight === undefined || x.maxJumpDistance === undefined)) {
    issues.push("locomotion.maxJumpHeight/maxJumpDistance: required when modes includes 'hop'")
  }
}

const characterChecks: readonly Check[] = [
  (d, issues) => {
    if (!isStr(d.id) || d.id.length === 0) issues.push('id: required non-empty string')
    if (!isStr(d.rig) || d.rig.length === 0) issues.push('rig: required non-empty string (RigTemplate id)')

    if (d.proportions !== undefined) {
      if (!isRecord(d.proportions)) issues.push('proportions: must be an object (jointId → scalar)')
      else
        for (const [k, v] of Object.entries(d.proportions)) {
          if (!isNum(v) || v <= 0) issues.push(`proportions.${k}: must be a positive number`)
        }
    }

    if (d.style !== undefined) {
      if (!isRecord(d.style)) issues.push('style: must be an object {color, width, linecap?}')
      else {
        if (!isStr(d.style.color) || d.style.color.length === 0) issues.push('style.color: required non-empty string')
        if (!isNum(d.style.width) || d.style.width <= 0) issues.push('style.width: required positive number')
        if (d.style.linecap !== undefined && d.style.linecap !== 'round' && d.style.linecap !== 'butt') {
          issues.push("style.linecap: must be 'round' or 'butt'")
        }
      }
    }

    if (d.palette !== undefined) {
      if (!isRecord(d.palette)) issues.push('palette: must be an object (name → color string)')
      else for (const [k, v] of Object.entries(d.palette)) if (!isStr(v)) issues.push(`palette.${k}: must be a color string`)
    }

    if (d.accessoryPoints !== undefined) {
      if (!isArr(d.accessoryPoints)) issues.push('accessoryPoints: must be an array of strings')
      else d.accessoryPoints.forEach((a, i) => { if (!isStr(a)) issues.push(`accessoryPoints[${i}]: must be a string`) })
    }

    if (d.reactions !== undefined) checkReactions(d.reactions, 'reactions', issues)

    checkPersonality(d.personality, issues)
    checkLocomotion(d.locomotion, issues)
  },
]

export function tryValidateCharacter(doc: unknown): ValidateResult<CharacterDoc> {
  return tryValidate<CharacterDoc>(doc, characterChecks)
}
