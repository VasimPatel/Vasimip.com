// Forward-kinematics solver (L0) — pure, DOM-free, deterministic, allocation-light.
//
// Given a RigTemplate (joint tree) and a Pose (LOCAL angles + root offset), produce
// world-space origin/end points and a world angle per bone. This is the geometry
// the renderer draws and the P4 IK / P5 secondary layers build on.
//
// Angle convention: SVG space (x→right, y→down), angle θ measured from +x toward
// +y (clockwise on screen). A bone's end = origin + length·(cos θ, sin θ).
//
//   worldAngle(joint) = worldAngle(parent) + localAngle(joint)
//   root joints:        worldAngle = root.rot + localAngle
//
// Branch rule (Spike B): a child with `attach: 'origin'` grows from its parent's
// ORIGIN point instead of its END — this is how hips branch from the pelvis hub
// rather than the neck. Default is 'end'.

import type { RigTemplate, JointDef, Pose, RootOffset } from '@dash/schema'

/** One solved bone: world-space origin, end, and world angle (radians). Plain data. */
export interface SolvedBone {
  id: string
  ox: number
  oy: number
  ex: number
  ey: number
  worldAngle: number
}

/** Solved skeleton: one bone per rig joint, in rig.joints order. */
export interface SolvedSkeleton {
  bones: SolvedBone[]
}

export interface SolveFkOptions {
  /** jointId → bone-length scalar (default 1). Typically CharacterDoc.proportions. */
  proportions?: Record<string, number>
  /** Overrides pose.root — places the character in the world without mutating the pose. */
  rootTransform?: RootOffset
}

const ZERO_ROOT: RootOffset = { x: 0, y: 0, rot: 0 }

export function solveFk(rig: RigTemplate, pose: Pose, opts?: SolveFkOptions): SolvedSkeleton {
  const root = opts?.rootTransform ?? pose.root ?? ZERO_ROOT
  const props = opts?.proportions
  const angles = pose.angles

  const byId = new Map<string, JointDef>()
  for (const j of rig.joints) byId.set(j.id, j)

  const solved = new Map<string, SolvedBone>()

  function resolve(joint: JointDef): SolvedBone {
    const cached = solved.get(joint.id)
    if (cached) return cached

    let ox: number
    let oy: number
    let parentWorld: number
    if (joint.parentId === null) {
      ox = root.x
      oy = root.y
      parentWorld = root.rot
    } else {
      const parent = byId.get(joint.parentId)
      if (parent === undefined) {
        // Invalid rig (unknown parent). Validator catches this; degrade to root
        // placement rather than throwing, so a bad doc still renders something.
        ox = root.x
        oy = root.y
        parentWorld = root.rot
      } else {
        const ps = resolve(parent)
        parentWorld = ps.worldAngle
        if (joint.attach === 'origin') {
          ox = ps.ox
          oy = ps.oy
        } else {
          ox = ps.ex
          oy = ps.ey
        }
      }
    }

    const worldAngle = parentWorld + (angles[joint.id] ?? 0)
    const len = joint.length * (props?.[joint.id] ?? 1)
    const ex = ox + len * Math.cos(worldAngle)
    const ey = oy + len * Math.sin(worldAngle)

    const bone: SolvedBone = { id: joint.id, ox, oy, ex, ey, worldAngle }
    solved.set(joint.id, bone)
    return bone
  }

  const bones = rig.joints.map(resolve)
  return { bones }
}
