// Character runtime (L0–L6 composition) — owns ONE character's full per-tick
// pipeline, composing the existing engine layers in the NORMATIVE order (this is the
// doc Phase 9 mounts). The character's MOTION is solved here against the page's live
// collision world (the Phase 6 punt landing): the locomotion solver sweeps a capsule
// derived from the rig's rest proportions each tick.
//
// ── PER-TICK COMPOSITION ORDER (≤10 lines — normative) ────────────────────────────
//   1. behavior.advance()        sequence steps; begin movement / run side-effects
//   2. locomotion.preBlend()     advance gait/fly + ground collision; set base source
//   3. face = set.update(tick)   blink + look-at pupils
//   4. {pose,markers}=blender.tick()   base blend + additives (breathing/lookAt) + clip markers
//   5. locomotion.postBlend(markers)   jump launch synced to the clip marker; ballistics + landing
//   6. solved = solveFk(angles, rootTransform=transform + breathing bob)
//   7. set.feedSolved(solved)    frame for NEXT tick's look-at
//   8. secondary.step(solved)    verlet follow-through targets (does NOT step the world)
//   → the CALLER steps the ONE shared verlet world once, after all characters.
//
// blender/secondary/verlet carry their OWN serializable state; this runtime's state
// is {transform, locomotion, behavior(+flags), blender, blink}.

import type { CharacterDoc, RigTemplate, Pose, Clip, BehaviorDoc } from '@dash/schema'
import { solveFk, type SolvedSkeleton } from './fk'
import { createBlender, type Blender, type BlenderState } from './blender'
import { createControllerSet, type ControllerSet, type ControllerSetState } from './controllers/set'
import type { FaceAux } from './controllers/face'
import { createSecondary, type Secondary } from './secondary'
import type { VerletWorld } from './verlet'
import type { Rng } from './rng'
import type { EventBus } from './events'
import type { MutableWorld } from './world/holes'
import type { Capsule } from './world/collision'
import {
  createLocomotion,
  type Locomotion,
  type LocomotionState,
  type CharacterTransform,
} from './locomotion'
import { createBehaviorExecutor, type BehaviorExecutor, type BehaviorState } from './behavior'

export type { CharacterTransform } from './locomotion'

/** Default hip height above the floor at rest (px) if the rig can't be measured. */
const DEFAULT_HIP_HEIGHT = 30
/** Capsule radius as a fraction of the rest-pose half-width. */
const CAP_RADIUS_FRAC = 0.42
const CAP_RADIUS_MIN = 6
const CAP_RADIUS_MAX = 34

export interface CharacterRuntimeOptions {
  rig: RigTemplate
  character: CharacterDoc
  /** The page's mutable world (live collision + traversal). */
  world: MutableWorld
  /** The ONE shared verlet world (secondary + props + ropes). */
  verlet: VerletWorld
  rng: Rng
  events: EventBus
  /** Named clip library (idle, walk, jump, jumpLand, tuck, fly, …) — authored feel. */
  clips?: Record<string, Clip>
  /** Named pose library (idle/stand fallback, tuck, cheer, …). */
  poses?: Record<string, Pose>
  /** Conventional clip/pose names the locomotion solver looks up. */
  names?: { idle?: string; walk?: string; jump?: string; jumpLand?: string; tuck?: string; fly?: string }
  /** Rest pose used to size the collision capsule + seed the blend (default a zero pose). */
  restPose?: Pose
  /** Initial world transform (default {0,0,0, facing 1}). */
  initialTransform?: CharacterTransform
  /** Look-at target getter (cursor on-site; scriptable headlessly). */
  getLookTarget?: () => { x: number; y: number } | null
  /** Secondary verlet body id (distinct per character). */
  secondaryId?: string
  /** Resolve an impulse target (entity id) to a verlet body id. */
  resolveVerletBody?: (entityRef: string) => string | undefined
  /** Behavior registry (id → doc, immutable). Needed to RESTORE a snapshot taken
   * mid-behavior onto a fresh runtime — see BehaviorDeps.behaviors (P8 contract).
   * Docs passed to runBehavior() are auto-registered. */
  behaviors?: Record<string, BehaviorDoc>
}

export interface CharacterState {
  transform: CharacterTransform
  locomotion: LocomotionState
  behavior: BehaviorState
  blender: BlenderState
  /** Full controller-set snapshot (blink schedule + look-at's lagged head frame). */
  controllers: ControllerSetState
  /** The runtime's own tick counter — drives the controller phase (blink/breathing
   * read it); restoring without it would desync every timer from the snapshot. */
  tick: number
}

export interface CharacterRuntime {
  tick(): void
  runBehavior(doc: BehaviorDoc): void
  getState(): CharacterState
  setState(s: CharacterState): void
  readonly transform: CharacterTransform
  /** Last solved skeleton (post-additive, world-space) — for the renderer/tests. */
  solved(): SolvedSkeleton
  /** This tick's face aux channel. */
  face(): FaceAux
  /** Current world collision capsule. */
  capsule(): Capsule
  /** Verlet endpoint overrides for the renderer (secondary follow-through). */
  overrides(): Record<string, { ex: number; ey: number }>
  /** A behavior is in progress. 7b's watchdog force-release wraps this. */
  running(): boolean
  readonly locomotion: Locomotion
  readonly behavior: BehaviorExecutor
  dispose(): void
}

export function createCharacterRuntime(opts: CharacterRuntimeOptions): CharacterRuntime {
  const { rig, character, world, verlet, rng, events } = opts
  const clips = opts.clips ?? {}
  const poses = opts.poses ?? {}
  const restPose: Pose = opts.restPose ?? poses[opts.names?.idle ?? 'idle'] ?? { id: '__rest', angles: {} }

  const transform: CharacterTransform = opts.initialTransform
    ? { ...opts.initialTransform }
    : { x: 0, y: 0, rot: 0, facing: 1 }

  // ── capsule sizing from rig proportions ──────────────────────────────────────
  // Solve the rest pose at the origin and measure its bbox relative to the root
  // (transform anchor = pelvis/root). upExtent = head above hip, downExtent = feet
  // below hip; radius = CAP_RADIUS_FRAC × rest half-width, clamped. The capsule is a
  // vertical segment through the transform spanning [−upExtent, +downExtent].
  const restSolved = solveFk(rig, restPose, {
    proportions: character.proportions,
    rootTransform: { x: 0, y: 0, rot: 0 },
  })
  let minX = 0
  let maxX = 0
  let minY = 0
  let maxY = 0
  for (const b of restSolved.bones) {
    minX = Math.min(minX, b.ox, b.ex)
    maxX = Math.max(maxX, b.ox, b.ex)
    minY = Math.min(minY, b.oy, b.ey)
    maxY = Math.max(maxY, b.oy, b.ey)
  }
  // The blender's base root y is seeded from restPose (e.g. stand's y≈16), so pose
  // root y is offset by that baseline. Fold only the DELTA in as a bob (breathing on
  // idle/ground, crouch-dip on the jump anticipation clip) — never the baseline.
  const baselineRootY = restPose.root?.y ?? 0
  const capR = Math.max(CAP_RADIUS_MIN, Math.min(CAP_RADIUS_MAX, CAP_RADIUS_FRAC * (maxX - minX) * 0.5))
  const upExtent = Math.max(capR, -minY) // head above hip (y-up = negative)
  const downExtent = Math.max(capR, maxY) // feet below hip
  const hipHeight = downExtent > 0 ? downExtent : DEFAULT_HIP_HEIGHT

  function capsule(): Capsule {
    return {
      x0: transform.x,
      y0: transform.y - (upExtent - capR),
      x1: transform.x,
      y1: transform.y + (downExtent - capR),
      r: capR,
    }
  }

  // ── layer construction (composition order fixed) ──────────────────────────────
  const blender: Blender = createBlender(rig, { initialPose: restPose })
  const controllerSet: ControllerSet = createControllerSet(blender, rig, character, {
    rng,
    getTarget: opts.getLookTarget,
  })
  const secondary: Secondary = createSecondary(rig, verlet, {
    proportions: character.proportions,
    id: opts.secondaryId ?? `secondary:${character.id}`,
  })

  const locomotion: Locomotion = createLocomotion({
    rig,
    character,
    world,
    blender,
    events,
    characterId: character.id,
    clips,
    poses,
    names: opts.names,
    transform,
    capsule,
    hipHeight,
  })

  const behavior: BehaviorExecutor = createBehaviorExecutor({
    locomotion,
    blender,
    verlet,
    world,
    events,
    characterId: character.id,
    clips,
    poses,
    names: { idle: opts.names?.idle },
    resolveVerletBody: opts.resolveVerletBody,
    behaviors: opts.behaviors,
  })

  let lastSolved: SolvedSkeleton = restSolved
  let lastFace: FaceAux = { pupilDx: 0, pupilDy: 0, blink: 0 }
  let tickCount = 0

  function tick(): void {
    tickCount++
    // 1. sequence steps (begin movement / run side-effects). Reads locomotion status
    //    from the PREVIOUS tick to advance the cursor.
    behavior.advance()
    // 2. advance gait/fly + set the blender base source; ground/fly collision.
    locomotion.preBlend()
    // 3. face contributors (blink + look-at pupils).
    lastFace = controllerSet.update(tickCount)
    // 4. base blend + additives; clip markers drive the jump launch sync.
    const { pose, markers } = blender.tick()
    // 5. jump launch (marker-synced) + ballistic integration + landing.
    locomotion.postBlend(markers)
    // 6. POST-ADDITIVE FK at the world transform (breathing bob = blender root Y).
    lastSolved = solveFk(
      rig,
      { id: '__pose', angles: pose.angles },
      {
        proportions: character.proportions,
        rootTransform: { x: transform.x, y: transform.y + (pose.root.y - baselineRootY), rot: transform.rot },
      },
    )
    // 7. frame for NEXT tick's look-at.
    controllerSet.feedSolved(lastSolved)
    // 8. secondary follow-through TARGETS (caller steps the shared verlet once).
    secondary.step(lastSolved)
  }

  function runBehavior(doc: BehaviorDoc): void {
    behavior.run(doc)
  }

  return {
    tick,
    runBehavior,
    getState(): CharacterState {
      return {
        transform: { ...transform },
        locomotion: locomotion.getState(),
        behavior: behavior.getState(),
        blender: blender.getState(),
        controllers: controllerSet.getState(),
        tick: tickCount,
      }
    },
    setState(s: CharacterState): void {
      transform.x = s.transform.x
      transform.y = s.transform.y
      transform.rot = s.transform.rot
      transform.facing = s.transform.facing
      locomotion.setState(s.locomotion)
      behavior.setState(s.behavior)
      blender.setState(s.blender)
      controllerSet.setState(s.controllers)
      tickCount = s.tick
      // Additives are behavior, re-registered by construction (the set stays live).
    },
    get transform() {
      return transform
    },
    solved: () => lastSolved,
    face: () => lastFace,
    capsule,
    overrides: () => secondary.overrides(),
    running: () => behavior.running(),
    locomotion,
    behavior,
    dispose(): void {
      controllerSet.dispose()
    },
  }
}
