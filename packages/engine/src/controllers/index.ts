// L2 procedural controllers — always-on additive contributors + the eye aux
// channel. Re-exported from @dash/engine.

export type { FaceAux, FaceFn, BrowState, MouthState } from './face'
export { NEUTRAL_FACE, RESTING_FACE } from './face'

export { createExpression } from './expression'
export type { ExpressionController, ExpressionState } from './expression'

export { createSquashFlourish } from './squash'
export type { SquashFlourish, FlourishKind } from './squash'

export type { Controller } from './breathing'
export { breathing } from './breathing'
export { weightShift } from './weight-shift'
export { blink } from './blink'
export type { BlinkController, BlinkState } from './blink'
export { lookAt } from './look-at'
export type { LookAtController, LookAtOptions, HeadFrame } from './look-at'

export { createControllerSet } from './set'
export type { ControllerSet, ControllerSetOptions, ControllerSetState } from './set'
