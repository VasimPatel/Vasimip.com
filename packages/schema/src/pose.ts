// Pose (L1a) — a named map of LOCAL joint angles (radians) plus an optional root
// offset. A Pose alone is structurally valid (tryValidatePose); validated against
// a rig it must only reference known joints (validatePoseAgainstRig). Angles are
// LOCAL: FK composes each as parentWorldAngle + localAngle (see packages/engine).

import { tryValidate, isRecord, isNum, isStr, type ValidateResult, type Issues, type Check } from './validate'
import { tryValidateRig, type RigTemplate } from './rig'

export interface RootOffset {
  x: number
  y: number
  /** Root world rotation, radians. */
  rot: number
}

export interface Pose {
  id: string
  /** jointId → local angle in radians. */
  angles: Record<string, number>
  root?: RootOffset
}

function checkAngles(x: unknown, issues: Issues): void {
  if (!isRecord(x)) {
    issues.push('angles: required object (jointId → radians)')
    return
  }
  for (const [k, v] of Object.entries(x)) {
    if (!isNum(v)) issues.push(`angles.${k}: must be a finite number (radians)`)
  }
}

const poseChecks: readonly Check[] = [
  (d, issues) => {
    if (!isStr(d.id) || d.id.length === 0) issues.push('id: required non-empty string')
    checkAngles(d.angles, issues)
    if (d.root !== undefined) {
      if (!isRecord(d.root)) issues.push('root: must be an object {x, y, rot}')
      else {
        if (!isNum(d.root.x)) issues.push('root.x: required finite number')
        if (!isNum(d.root.y)) issues.push('root.y: required finite number')
        if (!isNum(d.root.rot)) issues.push('root.rot: required finite number (radians)')
      }
    }
  },
]

/** Structural pose validation — shape only, no rig cross-check. */
export function tryValidatePose(doc: unknown): ValidateResult<Pose> {
  return tryValidate<Pose>(doc, poseChecks)
}

/**
 * Validate a pose against a rig: structural checks PLUS every angle key must name
 * a joint that exists in the rig. `rig` may be a raw doc or an already-validated
 * RigTemplate; an invalid rig is reported as a single error.
 */
export function validatePoseAgainstRig(pose: unknown, rig: unknown): ValidateResult<Pose> {
  const structural = tryValidatePose(pose)
  if (!structural.ok) return structural

  const rigResult: ValidateResult<RigTemplate> = tryValidateRig(rig)
  if (!rigResult.ok) return { ok: false, errors: [`rig: invalid (${rigResult.errors.length} problem(s))`] }

  const known = new Set(rigResult.doc.joints.map((j) => j.id))
  const errors: string[] = []
  for (const key of Object.keys(structural.doc.angles)) {
    if (!known.has(key)) errors.push(`angles.${key}: unknown joint (not in rig ${JSON.stringify(rigResult.doc.id)})`)
  }
  if (errors.length > 0) return { ok: false, errors }
  return structural
}
