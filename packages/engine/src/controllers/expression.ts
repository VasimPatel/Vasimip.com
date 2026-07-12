// Expression controller (L2, charm checkpoint) — turns behavior events into facial
// ACTING. The legacy Dash's charm is that his face reacts: brows shoot up at a
// launch, gritted teeth on a landing, worried "ow" face on a bonk, back to the
// determined little smile at rest. This controller listens to the character's
// event bus and drives the FaceAux brow/mouth/intensity channels with a tick-based
// decay — deterministic (event-driven + tick arithmetic, no clock, no rng).
//
// Wiring: construct with the character's bus (the same one the runtime emits
// milestones on); call face(tick) as a FaceFn from the controller set. State is
// tiny and serializable (getState/setState) so snapshot/restore keeps mid-reaction
// faces intact.

import type { EventBus } from '../events'
import type { BrowState, FaceAux, MouthState } from './face'

interface ExpressionMoment {
  brow: BrowState
  mouth: MouthState
  /** How long the moment holds at full intensity before decaying, in ticks. */
  holdTicks: number
  /** Decay rate per tick after the hold (exponential toward resting). */
  decay: number
}

/** Event → facial moment. Later entries in a tick win (last-write). Tuned by eye
 * against the legacy site — these are acting choices, not physics. */
const MOMENTS: Record<string, ExpressionMoment> = {
  'jump:launch': { brow: 'raised', mouth: 'o', holdTicks: 18, decay: 0.94 },
  'jump:land': { brow: 'determined', mouth: 'grit', holdTicks: 22, decay: 0.9 },
  'intent:blocked': { brow: 'worried', mouth: 'o', holdTicks: 55, decay: 0.95 },
  'intent:failed': { brow: 'worried', mouth: 'grit', holdTicks: 45, decay: 0.95 },
  'intent:timeout': { brow: 'worried', mouth: 'none', holdTicks: 60, decay: 0.96 },
  'intent:arrived': { brow: 'determined', mouth: 'smile', holdTicks: 30, decay: 0.92 },
  'behavior:complete': { brow: 'determined', mouth: 'smile', holdTicks: 40, decay: 0.92 },
  'intent:say': { brow: 'raised', mouth: 'smile', holdTicks: 35, decay: 0.93 },
  'watchdog:forced-release': { brow: 'worried', mouth: 'o', holdTicks: 70, decay: 0.96 },
  'expression:poke': { brow: 'raised', mouth: 'o', holdTicks: 30, decay: 0.9 },
}

const REST_BROW: BrowState = 'determined'
const REST_MOUTH: MouthState = 'smile'
const REST_INTENSITY = 0.5

export interface ExpressionState {
  brow: BrowState
  mouth: MouthState
  intensity: number
  holdLeft: number
  decay: number
  facing: 1 | -1
}

export interface ExpressionController {
  /** FaceFn — merge into the controller set's face accumulation. */
  face(tick: number): Partial<FaceAux>
  /** Advance hold/decay one tick (the set calls this once per update). */
  step(): void
  /** Heading hint from locomotion (+1 right / −1 left); sticky between moves. */
  setFacing(facing: 1 | -1): void
  getState(): ExpressionState
  setState(s: ExpressionState): void
  dispose(): void
}

export function createExpression(events: EventBus): ExpressionController {
  let state: ExpressionState = {
    brow: REST_BROW,
    mouth: REST_MOUTH,
    intensity: REST_INTENSITY,
    holdLeft: 0,
    decay: 0.92,
    facing: 1,
  }

  const offs: Array<() => void> = []
  for (const [event, moment] of Object.entries(MOMENTS)) {
    offs.push(
      events.on(event, () => {
        state.brow = moment.brow
        state.mouth = moment.mouth
        state.intensity = 1
        state.holdLeft = moment.holdTicks
        state.decay = moment.decay
      }),
    )
  }

  return {
    face(): Partial<FaceAux> {
      return { brow: state.brow, mouth: state.mouth, intensity: state.intensity, facing: state.facing }
    },
    step(): void {
      if (state.holdLeft > 0) {
        state.holdLeft--
        return
      }
      if (state.intensity > REST_INTENSITY) {
        state.intensity = REST_INTENSITY + (state.intensity - REST_INTENSITY) * state.decay
        if (state.intensity - REST_INTENSITY < 0.02) {
          state.intensity = REST_INTENSITY
          state.brow = REST_BROW
          state.mouth = REST_MOUTH
        }
      }
    },
    setFacing(facing) {
      state.facing = facing
    },
    getState: () => ({ ...state }),
    setState(s) {
      state = { ...s }
    },
    dispose() {
      for (const off of offs) off()
      offs.length = 0
    },
  }
}
