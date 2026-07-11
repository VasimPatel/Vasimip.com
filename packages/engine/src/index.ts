// @dash/engine — deterministic, DOM-free sim core (loop, context, hash).
// May depend only on @dash/schema (per ENGINE_V2 §3); Phase 1 needs nothing from
// it yet, so this package declares no runtime deps.

export { SIM_HZ, STEP_MS, MAX_TICKS_PER_ADVANCE, createLoop } from './loop'
export type { Loop } from './loop'

export { createRng } from './rng'
export type { Rng } from './rng'

export { createEventBus } from './events'
export type { EventBus, TraceEvent, Listener } from './events'

export { createClock } from './clock'
export type { Clock } from './clock'

export { createContext } from './context'
export type { EngineContext } from './context'

export { serializeState, hashState } from './hash'

export { solveFk } from './fk'
export type { SolvedBone, SolvedSkeleton, SolveFkOptions } from './fk'

// ── Phase 3: clips + blend layer (L1b) ───────────────────────────────────────
export { wrapPi, lerp, smoothDamp, smoothDampAngle } from './math'
export type { SmoothDampResult } from './math'

export { sampleClip, markersCrossed, createClipPlayer, easeValue, clipDuration } from './clip'
export type { ClipSample, ClipPlayer, ClipPlayerState } from './clip'

export { createBlender } from './blender'
export type { Blender, BlenderState, BlenderTick, BlenderOptions, AdditiveFn } from './blender'

// ── Phase 4: procedural controllers, IK, gait (L2) ───────────────────────────
export { solveTwoBone, solveChainToLocal } from './ik'
export type { TwoBoneResult, ChainLocalAngles } from './ik'

export { breathing, weightShift, blink, lookAt, createControllerSet, NEUTRAL_FACE } from './controllers'
export type {
  FaceAux,
  FaceFn,
  Controller,
  BlinkController,
  BlinkState,
  LookAtController,
  LookAtOptions,
  HeadFrame,
  ControllerSet,
  ControllerSetOptions,
} from './controllers'

export { createGait } from './gait'
export type { Gait, GaitOptions, GaitFrame, PlantedFoot } from './gait'

// ── Phase 5: shared verlet solver + character secondary (L3) ─────────────────
export {
  createVerletWorld,
  DEFAULT_GRAVITY,
  DEFAULT_DAMPING,
  DEFAULT_ITERATIONS,
  SLEEP_EPSILON,
  SLEEP_TICKS,
  PROP_STIFFNESS,
} from './verlet'
export type {
  VerletWorld,
  VerletWorldOptions,
  VerletState,
  BodyHandle,
  BodyKind,
  BodyOptions,
  ParticleSpec,
  ConstraintSpec,
  PropSpec,
  RopeSpec,
  StiffnessClass,
  Point,
} from './verlet'

export { createSecondary, SECONDARY_STIFFNESS, SECONDARY_DAMPING, SECONDARY_ITERS } from './secondary'
export type { Secondary, SecondaryOptions } from './secondary'

export type { ParticleView, CollisionPass } from './verlet'

// ── Phase 6a: world model (L5) — surfaces, collision, traversal ──────────────────
export { surfaceGeometry, panelEdges, pointInBox } from './world/surfaces'
export type { SurfaceGeometry } from './world/surfaces'

export {
  sweptCircleVsSegment,
  sweptCapsuleVsSegment,
  sweptCapsuleVsSegments,
  sweptPointVsSegments,
  stopAt,
  slideAlong,
  reflect,
  buildCollisionWorld,
  isEnclosed,
  nearestSurface,
  createContactTracker,
  createVerletPanelCollider,
} from './world/collision'
export type {
  Capsule,
  SegmentRef,
  SweptHit,
  PanelCollision,
  CollisionWorld,
  NearestSurface,
  Contact,
  ContactEvent,
  ContactTracker,
} from './world/collision'

export { buildTraversalGraph, checkGraphSanity } from './world/traversal'
export type { TraversalGraph, TravNode, TravEdge, EdgeType, NodeKind, SanityReport } from './world/traversal'

export { worldFromNotebook } from './world/from-notebook'
export type { NotebookPageInput, NotebookPanelInput, PageWorld } from './world/from-notebook'

// ── Phase 6b: mutable boundaries (holes + heal) + rule table + projectiles (L5) ──
export { createMutableWorld, DEFAULT_HEAL_MS, HOLE_EDGE_TRIM } from './world/holes'
export type { MutableWorld, MutableWorldOptions, MutableWorldState, HoleSpec, HoleId, HoleRecord, CutOpts } from './world/holes'

export { createRuleTable, dispatch, nearestEdgeInterval, DEFAULT_RULES, DEFAULT_CUT_WIDTH } from './world/rules'
export type { RuleTable, RuleEntity, RuleEventCtx, DispatchAction, DispatchResult } from './world/rules'

export { createProjectileSim } from './world/projectile'
export type { ProjectileSim, ProjectileSpec, ProjectileState, ProjectileSimState, ProjectileSimOptions } from './world/projectile'
