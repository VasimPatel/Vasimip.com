// RigTemplate (L0) — a joint-hierarchy template. Characters are instances of a
// rig (CharacterDoc) + a Pose supplying local joint angles. This is a REAL Phase 2
// schema (ENGINE_V2 §5), consumed by the FK solver (packages/engine) now and by
// the traversal graph / IK in P4+. It is NOT folded into WorldDocV2 yet (that
// composition is P6).
//
// Tree shape: `joints` form a single-rooted tree via `parentId` (null = root).
// The validator rejects cycles, unknown parents, duplicate ids, and more than one
// root — an invalid tree would make FK non-terminating or ambiguous.

import { tryValidate, isRecord, isNum, isStr, isArr, type ValidateResult, type Issues, type Check } from './validate'

/**
 * Where a child bone's origin sits on its parent:
 *  - 'end'    (default) — child grows from the parent bone's END point (normal chain).
 *  - 'origin'           — child grows from the parent bone's ORIGIN point.
 *
 * The 'origin' case models limbs that branch from a hub rather than the tip: hips
 * branch from the PELVIS origin, not its end (Spike B: "hip joints must branch
 * from the pelvis origin, not its end"). This is a structural rig property, not a
 * new capability — it is the single schema field added beyond the §5 sketches.
 */
export type Attach = 'end' | 'origin'

export interface JointDef {
  id: string
  /** Parent joint id, or null for the (single) root. */
  parentId: string | null
  /** Bone length in rig units (scaled per-character by proportions). */
  length: number
  /** Optional local-angle clamp [min, max] radians (declared now, enforced in P4). */
  limits?: [number, number]
  /** Preferred IK bend direction (declared now, consumed in P4). */
  bendHint?: 1 | -1
  /** Where this bone attaches on its parent (default 'end'). */
  attach?: Attach
}

/** Minimal typed stub — two-bone IK chain (root, mid, tip). Consumed in P4, validated now. */
export interface IkChainDef {
  id: string
  jointIds: [string, string, string]
}

export interface RigTemplate {
  id: string
  joints: JointDef[]
  chains: IkChainDef[]
  /** Joint ids eligible for secondary (verlet follow-through) motion in P5. */
  secondarySlots: string[]
}

// ── validation ────────────────────────────────────────────────────────────────

function checkJoints(rig: Record<string, unknown>, issues: Issues): Set<string> {
  const ids = new Set<string>()
  const joints = rig.joints
  if (!isArr(joints)) {
    issues.push('joints: required array')
    return ids
  }
  // First pass: structural checks + collect ids (so parent refs can be checked next).
  const parsed: { id: string; parentId: string | null }[] = []
  joints.forEach((j, i) => {
    const path = `joints[${i}]`
    if (!isRecord(j)) {
      issues.push(`${path}: must be an object`)
      return
    }
    let id = ''
    if (!isStr(j.id) || j.id.length === 0) issues.push(`${path}.id: required non-empty string`)
    else {
      id = j.id
      if (ids.has(id)) issues.push(`${path}.id: duplicate id ${JSON.stringify(id)}`)
      else ids.add(id)
    }
    const parentId = j.parentId
    if (parentId !== null && !isStr(parentId)) issues.push(`${path}.parentId: must be a string or null`)
    if (!isNum(j.length) || j.length <= 0) issues.push(`${path}.length: required positive number`)
    if (j.limits !== undefined) {
      if (!isArr(j.limits) || j.limits.length !== 2 || !isNum(j.limits[0]) || !isNum(j.limits[1])) {
        issues.push(`${path}.limits: must be [min, max] finite numbers`)
      }
    }
    if (j.bendHint !== undefined && j.bendHint !== 1 && j.bendHint !== -1) {
      issues.push(`${path}.bendHint: must be 1 or -1`)
    }
    if (j.attach !== undefined && j.attach !== 'end' && j.attach !== 'origin') {
      issues.push(`${path}.attach: must be 'end' or 'origin'`)
    }
    parsed.push({ id, parentId: parentId === null || isStr(parentId) ? (parentId as string | null) : null })
  })

  // Second pass: parent references, root count, cycles (only if ids are sane).
  const byId = new Map<string, string | null>()
  for (const p of parsed) if (p.id) byId.set(p.id, p.parentId)

  let roots = 0
  for (const p of parsed) {
    if (!p.id) continue
    if (p.parentId === null) {
      roots++
    } else if (!byId.has(p.parentId)) {
      issues.push(`joints: joint ${JSON.stringify(p.id)} references unknown parent ${JSON.stringify(p.parentId)}`)
    }
  }
  if (roots === 0) issues.push('joints: no root joint (exactly one joint must have parentId null)')
  if (roots > 1) issues.push(`joints: ${roots} root joints found (exactly one joint must have parentId null)`)

  // Cycle detection: walk each joint's parent chain; a revisit is a cycle.
  for (const p of parsed) {
    if (!p.id) continue
    const seen = new Set<string>()
    let cur: string | null = p.id
    while (cur !== null) {
      if (seen.has(cur)) {
        issues.push(`joints: cycle detected through joint ${JSON.stringify(p.id)}`)
        break
      }
      seen.add(cur)
      const next: string | null | undefined = byId.get(cur)
      if (next === undefined) break // unknown parent already reported
      cur = next
    }
  }

  return ids
}

const rigChecks: readonly Check[] = [
  (d, issues) => {
    if (!isStr(d.id) || d.id.length === 0) issues.push('id: required non-empty string')
    const ids = checkJoints(d, issues)

    if (d.chains !== undefined) {
      if (!isArr(d.chains)) issues.push('chains: must be an array')
      else
        d.chains.forEach((c, i) => {
          const path = `chains[${i}]`
          if (!isRecord(c)) return issues.push(`${path}: must be an object`)
          if (!isStr(c.id) || c.id.length === 0) issues.push(`${path}.id: required non-empty string`)
          if (!isArr(c.jointIds) || c.jointIds.length !== 3) issues.push(`${path}.jointIds: required [root, mid, tip] triple`)
          else
            c.jointIds.forEach((jid, k) => {
              if (!isStr(jid)) issues.push(`${path}.jointIds[${k}]: must be a string`)
              else if (!ids.has(jid)) issues.push(`${path}.jointIds[${k}]: unknown joint ${JSON.stringify(jid)}`)
            })
        })
    } else {
      issues.push('chains: required array (may be empty)')
    }

    if (d.secondarySlots !== undefined) {
      if (!isArr(d.secondarySlots)) issues.push('secondarySlots: must be an array')
      else
        d.secondarySlots.forEach((s, i) => {
          if (!isStr(s)) issues.push(`secondarySlots[${i}]: must be a string`)
          else if (!ids.has(s)) issues.push(`secondarySlots[${i}]: unknown joint ${JSON.stringify(s)}`)
        })
    } else {
      issues.push('secondarySlots: required array (may be empty)')
    }
  },
]

export function tryValidateRig(doc: unknown): ValidateResult<RigTemplate> {
  return tryValidate<RigTemplate>(doc, rigChecks)
}
