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
