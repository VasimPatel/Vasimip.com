// Two-bone analytic IK solver (L2) — pure, DOM-free, deterministic.
//
// Angles use SVG space (x→right, y→down), measured from +x toward +y.
// The low-level solver returns WORLD angles; the chain adapter converts them
// to LOCAL joint angles for the FK hierarchy.

import type { RigTemplate, IkChainDef } from '@dash/schema'
import { wrapPi } from './math'

export interface TwoBoneResult {
  angle1: number
  angle2: number
}

export function solveTwoBone(
  rootX: number,
  rootY: number,
  targetX: number,
  targetY: number,
  len1: number,
  len2: number,
  bendHint: 1 | -1,
): TwoBoneResult {
  const dx = targetX - rootX
  const dy = targetY - rootY
  const baseAngle = Math.atan2(dy, dx)
  let d = Math.hypot(dx, dy)

  const dMax = len1 + len2 - 1e-4
  const dMin = Math.abs(len1 - len2) + 1e-4
  if (d >= dMax) return { angle1: baseAngle, angle2: baseAngle }
  if (d < dMin) d = dMin

  if (len1 <= 0 || len2 <= 0) return { angle1: baseAngle, angle2: baseAngle }

  const cosA = Math.max(-1, Math.min(1, (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d)))
  const a = Math.acos(cosA)
  const angle1 = baseAngle - bendHint * a

  const cosB = Math.max(-1, Math.min(1, (len1 * len1 + len2 * len2 - d * d) / (2 * len1 * len2)))
  const b = Math.acos(cosB)
  const angle2 = angle1 + bendHint * (Math.PI - b)

  return { angle1, angle2 }
}

export interface ChainLocalAngles {
  root: number
  mid: number
}

export function solveChainToLocal(
  rig: RigTemplate,
  chain: IkChainDef,
  hipX: number,
  hipY: number,
  parentWorldAngle: number,
  targetX: number,
  targetY: number,
  proportions?: Record<string, number>,
  /** Override the rig's bendHint (gait: a walking knee bends along the direction
   * of travel — the rig's static hints splay the knees for the STAND art and read
   * as a backwards knee mid-stride). */
  bendOverride?: 1 | -1,
): ChainLocalAngles {
  const rootId = chain.jointIds[0]
  const midId = chain.jointIds[1]
  const rootJoint = rig.joints.find((joint) => joint.id === rootId)!
  const midJoint = rig.joints.find((joint) => joint.id === midId)!
  const len1 = rootJoint.length * (proportions?.[rootId] ?? 1)
  const len2 = midJoint.length * (proportions?.[midId] ?? 1)
  const bendHint = bendOverride ?? rootJoint.bendHint ?? 1

  const r = solveTwoBone(hipX, hipY, targetX, targetY, len1, len2, bendHint)
  return {
    root: wrapPi(r.angle1 - parentWorldAngle),
    mid: wrapPi(r.angle2 - r.angle1),
  }
}
