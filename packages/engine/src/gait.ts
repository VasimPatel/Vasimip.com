// Gait generator (L2) — procedural ground locomotion. Produces a per-tick pose
// (angles + root) for a character walking at a commanded velocity, plus the set of
// planted feet. It REPLACES the P3 fixed-keyframe walk clip for continuous ground
// movement (that clip stays as a fallback/reference; this file never touches it).
//
// How it stays honest:
//  • The root translates at EXACTLY the commanded speed (`root.x += speed·dt`), so
//    a caller can assert "walked the commanded distance".
//  • Feet are planted by the two-bone IK from ik.ts. The stance foot's world plant
//    point is a CLOSED FORM of the cycle phase and the root position that is
//    provably constant in world during stance (d(plant)/dt = speed − stride·cadence
//    = 0). The hip (pelvis origin) translates and bobs; the legs re-solve every tick
//    to keep the planted foot fixed — that's the foot-lock the gate checks.
//  • The swing foot follows a lifted arc between its last and next (fixed) plants.
//  • Arms counter-swing from the same phase; personality shapes cadence, bounce,
//    stride and arm asymmetry — with NO rng in the hot path (sloppiness is an
//    incommensurate sine, not noise).
//
// Surface is injected as `floorY(x) => y` (flat-floor stub for now; P6 swaps in a
// real surface model without touching this file).
//
// WIRING: the output is a BASE-path pose. In tests and the review harness it is fed
// straight to solveFk (bypassing the blender) so foot-lock is exact. On the site
// it is the blender's source: `blender.setSource(frame.pose, { durationMs: 1 })`
// each tick — durationMs≈1 pins the blender to its steady tracking smoothTime, so
// it de-jitters without lagging and stays velocity-continuous through gait↔clip
// transitions (P3 transition policy).

import type { CharacterDoc, Pose, RigTemplate, RootOffset } from '@dash/schema'
import { solveChainToLocal } from './ik'

const TWO_PI = Math.PI * 2
const PHI = 1.618033988749895

// Tunables (scaled by personality below).
const BASE_CADENCE = 1.0 // cycles/sec at neutral energy
const DUTY = 0.6 // fraction of the cycle a foot is in stance
const REF_SPEED = 60 // px/s reference for scaling bounce / arm swing
const BASE_LIFT = 9 // swing-foot lift height (px)
const BASE_BOB = 4 // vertical hip bob (px)
const BASE_ARM_SWING = 0.32 // rad
const DEFAULT_HIP_HEIGHT = 30 // hip above floor at rest (thigh21+shin16=37 max)

/** stand.json — the default standing baseline for non-leg joints. */
const DEFAULT_BASE: Pose = {
  id: '__gait_base',
  root: { x: 0, y: 16, rot: 0 },
  angles: {
    pelvis: -1.490966, neck: -0.07983, head: 0.141897,
    upperArmR: 1.980924, foreArmR: 1.621259, upperArmL: -2.359253, foreArmL: -1.14047,
    thighR: 2.408916, shinR: 0.535738, footR: -1.273834,
    thighL: -2.672873, shinL: -0.424194, footL: 1.249046,
  },
}

export interface GaitOptions {
  /** Support height under a world x. Flat-floor stub: `(x) => const`. Required. */
  floorY: (x: number) => number
  /** Commanded horizontal speed (px/s). May be 0 (steps settle in place). */
  speed: number
  /** Start world x of the root (default 0). */
  startX?: number
  /** Facing/travel direction; default = sign(speed) (or +1 when speed 0). */
  direction?: 1 | -1
  /** Hip height above the floor at rest (default 30). */
  hipHeight?: number
  /** Root rotation (default 0). */
  rootRot?: number
  /** Baseline pose for non-leg joints (default a built-in stand). */
  basePose?: Pose
}

export interface PlantedFoot {
  footId: string
  x: number
  y: number
}

export interface GaitFrame {
  pose: { angles: Record<string, number>; root: RootOffset }
  planted: PlantedFoot[]
}

export interface Gait {
  /** Advance by dt (ms); returns this tick's pose + planted feet. */
  update(dtMs: number): GaitFrame
  /** Current root world x (advances by speed·dt). */
  readonly rootX: number
  /** Accumulated cycle phase (cycles). */
  readonly phase: number
}

function smoothstep(u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u
  return c * c * (3 - 2 * c)
}

export function createGait(rig: RigTemplate, character: CharacterDoc, opts: GaitOptions): Gait {
  const { energy, bounciness, confidence, sloppiness } = character.personality
  const base = opts.basePose ?? DEFAULT_BASE
  const props = character.proportions
  const hipHeight = opts.hipHeight ?? DEFAULT_HIP_HEIGHT
  const rootRot = opts.rootRot ?? 0
  const speed = opts.speed
  const dir = opts.direction ?? (speed < 0 ? -1 : 1)

  const cadence = BASE_CADENCE * (0.7 + 0.6 * energy) // cycles/sec
  const stride = cadence !== 0 ? speed / cadence : 0 // world px per cycle
  const lift = BASE_LIFT * (0.5 + bounciness)
  const speedNorm = Math.min(1, Math.abs(speed) / REF_SPEED)
  const bob = BASE_BOB * (0.4 + 0.8 * bounciness) * speedNorm
  const armSwing = BASE_ARM_SWING * (0.5 + 0.7 * confidence) * (0.25 + 0.75 * speedNorm)

  // Legs branch from the pelvis ORIGIN, and pelvis is the root joint, so the hip is
  // the root point and the thigh's parent world angle is the pelvis world angle.
  const pelvisLocal = base.angles.pelvis ?? 0
  const pelvisWorld = rootRot + pelvisLocal

  const legR = rig.chains.find((c) => c.id === 'legR')
  const legL = rig.chains.find((c) => c.id === 'legL')

  let rootX = opts.startX ?? 0
  let phase = 0 // accumulated cycles

  /** World x of a leg's fixed plant, `laps` cycles from the current stance
   * (0 = the plant it is on / last on, 1 = the next). Constant in world during the
   * relevant interval by construction. */
  function plantWorldX(phiLeg: number, laps: number): number {
    return rootX + stride * (0.5 + laps - phiLeg)
  }

  function solveLeg(
    chainId: 'legR' | 'legL',
    footId: string,
    phaseOffset: number,
    hipY: number,
    out: Record<string, number>,
  ): PlantedFoot | null {
    const chain = chainId === 'legR' ? legR : legL
    if (!chain) return null
    const phiLeg = ((phase + phaseOffset) % 1 + 1) % 1

    let ankleX: number
    let ankleY: number
    let planted = false
    if (phiLeg < DUTY) {
      // STANCE — foot pinned to its fixed plant on the floor.
      ankleX = plantWorldX(phiLeg, 0)
      ankleY = opts.floorY(ankleX)
      planted = true
    } else {
      // SWING — arc from the last plant to the next plant.
      const s = (phiLeg - DUTY) / (1 - DUTY)
      const oldX = plantWorldX(phiLeg, 0)
      const nextX = plantWorldX(phiLeg, 1)
      ankleX = oldX + (nextX - oldX) * smoothstep(s)
      ankleY = opts.floorY(ankleX) - lift * Math.sin(Math.PI * s)
    }

    const local = solveChainToLocal(rig, chain, rootX, hipY, pelvisWorld, ankleX, ankleY, props)
    out[chain.jointIds[0]] = local.root
    out[chain.jointIds[1]] = local.mid
    // Foot bone kept at its baseline local (cosmetic on a flat floor).
    out[chain.jointIds[2]] = base.angles[chain.jointIds[2]] ?? 0

    return planted ? { footId, x: ankleX, y: ankleY } : null
  }

  return {
    update(dtMs: number): GaitFrame {
      const dt = dtMs / 1000
      rootX += speed * dt
      phase += cadence * dt

      const rootYRest = opts.floorY(rootX) - hipHeight
      const bounce = -bob * Math.abs(Math.sin(TWO_PI * phase))
      const rootY = rootYRest + bounce

      const angles: Record<string, number> = { ...base.angles }

      const planted: PlantedFoot[] = []
      const pr = solveLeg('legR', 'footR', 0, rootY, angles)
      const pl = solveLeg('legL', 'footL', 0.5, rootY, angles)
      if (pr) planted.push(pr)
      if (pl) planted.push(pl)

      // Arms counter-swing off the same phase; sloppiness = asymmetry + an
      // incommensurate wobble (no rng).
      const sw = Math.sin(TWO_PI * phase)
      const ampL = armSwing * (1 - 0.25 * sloppiness)
      const wobble = sloppiness * 0.08 * Math.sin(TWO_PI * PHI * phase)
      angles.upperArmR = (base.angles.upperArmR ?? 0) - armSwing * sw * dir
      angles.upperArmL = (base.angles.upperArmL ?? 0) + (ampL * sw + wobble) * dir

      return { pose: { angles, root: { x: rootX, y: rootY, rot: rootRot } }, planted }
    },
    get rootX() {
      return rootX
    },
    get phase() {
      return phase
    },
  }
}
