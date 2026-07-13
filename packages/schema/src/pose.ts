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

/** One drawable element of a pose prop, in px RELATIVE TO THE ANCHOR JOINT'S END
 * (figure axes, y down). The legacy action poses carried hand props — Fight's
 * sword, Spray's paint can — that the 9a polyline extraction dropped. */
export interface PropElement {
  kind: 'path' | 'circle' | 'rect'
  /** path */
  d?: string
  /** circle */
  cx?: number
  cy?: number
  r?: number
  /** rect */
  x?: number
  y?: number
  w?: number
  h?: number
  rx?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  /** Render-layer flutter (the legacy sprayjit on the paint mist). */
  jitter?: boolean
}

export interface PoseProp {
  /** Anchor joint — elements translate with its END point (e.g. the hand). */
  joint: string
  elements: PropElement[]
}

/** Face override while a pose is the active blend source (the legacy per-pose
 * expressions: Fight's steep brows + grit mouth). */
export interface PoseFace {
  brow?: 'determined' | 'fierce' | 'neutral' | 'raised' | 'worried'
  mouth?: 'smile' | 'grit' | 'o' | 'none'
  intensity?: number
}

export interface Pose {
  id: string
  /** jointId → local angle in radians. */
  angles: Record<string, number>
  root?: RootOffset
  props?: PoseProp[]
  face?: PoseFace
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

const BROWS = ['determined', 'fierce', 'neutral', 'raised', 'worried']
const MOUTHS = ['smile', 'grit', 'o', 'none']

function checkProps(x: unknown, issues: Issues): void {
  if (!Array.isArray(x)) {
    issues.push('props: must be an array')
    return
  }
  x.forEach((p, i) => {
    if (!isRecord(p) || !isStr(p.joint)) {
      issues.push(`props[${i}]: requires { joint, elements }`)
      return
    }
    if (!Array.isArray(p.elements)) {
      issues.push(`props[${i}].elements: required array`)
      return
    }
    p.elements.forEach((e, j) => {
      const at = `props[${i}].elements[${j}]`
      if (!isRecord(e) || (e.kind !== 'path' && e.kind !== 'circle' && e.kind !== 'rect')) {
        issues.push(`${at}.kind: must be 'path' | 'circle' | 'rect'`)
        return
      }
      if (e.kind === 'path' && !isStr(e.d)) issues.push(`${at}.d: required string for a path`)
      for (const num of ['cx', 'cy', 'r', 'x', 'y', 'w', 'h', 'rx', 'strokeWidth', 'opacity'] as const) {
        if (e[num] !== undefined && !isNum(e[num])) issues.push(`${at}.${num}: must be a finite number`)
      }
      for (const str of ['fill', 'stroke'] as const) {
        if (e[str] !== undefined && !isStr(e[str])) issues.push(`${at}.${str}: must be a string`)
      }
      if (e.jitter !== undefined && typeof e.jitter !== 'boolean') issues.push(`${at}.jitter: must be a boolean`)
      if (e.opacity !== undefined && isNum(e.opacity) && (e.opacity < 0 || e.opacity > 1)) issues.push(`${at}.opacity: must be in [0, 1]`)
    })
  })
}

const poseChecks: readonly Check[] = [
  (d, issues) => {
    if (!isStr(d.id) || d.id.length === 0) issues.push('id: required non-empty string')
    checkAngles(d.angles, issues)
    if (d.props !== undefined) checkProps(d.props, issues)
    if (d.face !== undefined) {
      if (!isRecord(d.face)) issues.push('face: must be an object')
      else {
        if (d.face.brow !== undefined && !BROWS.includes(d.face.brow as string)) issues.push(`face.brow: must be one of ${BROWS.join('|')}`)
        if (d.face.mouth !== undefined && !MOUTHS.includes(d.face.mouth as string)) issues.push(`face.mouth: must be one of ${MOUTHS.join('|')}`)
        if (d.face.intensity !== undefined && (!isNum(d.face.intensity) || d.face.intensity < 0 || d.face.intensity > 1)) issues.push('face.intensity: must be a number in [0, 1]')
      }
    }
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
  // Prop anchors must be real joints too — a typo would render the prop
  // unanchored at the SVG origin (independent-review finding).
  structural.doc.props?.forEach((p, i) => {
    if (!known.has(p.joint)) errors.push(`props[${i}].joint: unknown joint (not in rig ${JSON.stringify(rigResult.doc.id)})`)
  })
  if (errors.length > 0) return { ok: false, errors }
  return structural
}
