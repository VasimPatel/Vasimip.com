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
import { wrapPi } from './math'

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

/** The walking baseline. Legs/torso/head come from stand.json, but the ARMS HANG —
 * the stand pose's hands-on-hips read as stiff mid-stride (owner charm feedback).
 * Local angles: pelvis world ≈ −1.49, so upperArm local ≈ 3.0–3.1 points the arm
 * down; forearms carry a slight elbow bend, L/R deliberately a touch asymmetric
 * (hand-drawn, not mirrored). */
const DEFAULT_BASE: Pose = {
  id: '__gait_base',
  root: { x: 0, y: 16, rot: 0 },
  angles: {
    pelvis: -1.490966, neck: -0.07983, head: 0.141897,
    upperArmR: 3.02, foreArmR: 0.18, upperArmL: 3.14, foreArmL: 0.12,
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
  const rootRot = opts.rootRot ?? 0
  const speed = opts.speed
  const dir = opts.direction ?? (speed < 0 ? -1 : 1)

  // Cadence sets a NATURAL stride from speed — then the stride is CAPPED at a
  // leg-proportional maximum and cadence re-derived (quicker steps, not lunges;
  // owner charm feedback: uncapped stride hit ~94px on a 37px leg). The invariant
  // stride × cadence = |speed| is preserved either way (foot-lock depends on it).
  const naturalCadence = BASE_CADENCE * (0.7 + 0.6 * energy) // cycles/sec

  // WALK CROUCH (owner charm feedback — the "dragged body" walk): the STANDING hip
  // height can equal the full leg length, making side plants at ±stride/2
  // geometrically UNREACHABLE — the IK clamps at full extension and the feet float
  // toward plants they can never touch. A walker bends the knees: cap the walking
  // hip so the farthest plant stays reachable with a margin of knee bend.
  const legChainForLen = rig.chains.find((c) => c.id === 'legR') ?? rig.chains.find((c) => c.id === 'legL')
  let legLen = 37
  if (legChainForLen) {
    const j0 = rig.joints.find((j) => j.id === legChainForLen.jointIds[0])
    const j1 = rig.joints.find((j) => j.id === legChainForLen.jointIds[1])
    if (j0 && j1) {
      legLen =
        j0.length * (props?.[j0.id] ?? 1) +
        j1.length * (props?.[j1.id] ?? 1)
    }
  }
  const STRIDE_MAX = legLen * 1.1
  const naturalStride = naturalCadence !== 0 ? Math.abs(speed) / naturalCadence : 0
  const strideMag = Math.min(naturalStride, STRIDE_MAX)
  const stride = (speed < 0 ? -1 : 1) * strideMag
  const cadence = strideMag > 0 ? Math.abs(speed) / strideMag : naturalCadence

  const halfStride = strideMag / 2
  const reachableHip = Math.sqrt(Math.max(1, legLen * legLen - halfStride * halfStride)) * 0.97
  const hipHeight = Math.min(opts.hipHeight ?? DEFAULT_HIP_HEIGHT, reachableHip)
  const lift = BASE_LIFT * (0.5 + bounciness)
  const speedNorm = Math.min(1, Math.abs(speed) / REF_SPEED)
  const bob = BASE_BOB * (0.4 + 0.8 * bounciness) * speedNorm
  const armSwing = BASE_ARM_SWING * (0.5 + 0.7 * confidence) * (0.25 + 0.75 * speedNorm)

  // Legs branch from the pelvis ORIGIN, and pelvis is the root joint, so the hip is
  // the root point and the thigh's parent world angle is the pelvis world angle.
  // The walk lean tilts the pelvis per tick, so the WORLD angle the leg IK converts
  // through must be the LEANED one — a stale angle here reads as foot slide.
  const pelvisLocal = base.angles.pelvis ?? 0
  const lean = 0.07 * speedNorm
  let pelvisWorld = rootRot + pelvisLocal

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

    // Walking knees bend ALONG the travel direction (+x knee when heading right):
    // the rig's static bendHints splay the knees for the stand art and read as a
    // backwards knee mid-stride (owner charm feedback).
    const kneeBend: 1 | -1 = dir >= 0 ? 1 : -1
    const local = solveChainToLocal(rig, chain, rootX, hipY, pelvisWorld, ankleX, ankleY, props, kneeBend)
    out[chain.jointIds[0]] = local.root
    out[chain.jointIds[1]] = local.mid
    // FOOT: solved, not cosmetic (owner charm feedback — a baseline-local foot
    // rotates rigidly with the shin, windmilling and piercing the floor). Stance:
    // flat on the ground, toes forward. Swing: slight plantar tilt. World-angle
    // targeted, converted to local against the solved shin.
    const shinWorld = pelvisWorld + local.root + local.mid
    const tilt = planted ? 0 : 0.35
    const footWorld = kneeBend > 0 ? tilt : Math.PI - tilt
    out[chain.jointIds[2]] = wrapPi(footWorld - shinWorld)

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

      // Lean into the direction of travel BEFORE the legs solve (the IK's
      // world→local conversion reads pelvisWorld).
      const pelvisLean = pelvisLocal + lean * dir
      pelvisWorld = rootRot + pelvisLean
      angles.pelvis = pelvisLean

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
      // Forearms trail the upper-arm swing (bent elbows pump slightly; the verlet
      // secondary adds true follow-through on top of this in the full runtime).
      angles.foreArmR = (base.angles.foreArmR ?? 0) - 0.45 * armSwing * sw * dir
      angles.foreArmL = (base.angles.foreArmL ?? 0) + 0.45 * (ampL * sw + wobble) * dir

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
