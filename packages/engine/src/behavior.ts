// Intent executor (L6, 7a half) — sequential execution of a BehaviorDoc's steps.
// Movement verbs delegate to the locomotion solver; everything else is executed here.
//
// 7a semantics (reactions/cues/timeout-give-up/watchdog are 7b):
//   • Steps run in order. A movement step spans many ticks (locomotion drives it);
//     a blocked/failed movement HALTS the behavior with a `behavior:halted` trace
//     event (7b will dispatch reactions / give-up here instead).
//   • wait        — tick countdown.
//   • playClip    — blender source = clip; holds for the clip's duration (non-loop),
//                   or a fixed dwell for loop clips (default STRIKE_HOLD_MS).
//   • strikePose  — blender source = pose; holds `holdMs` (default STRIKE_HOLD_MS).
//   • impulse     — verlet.applyImpulse on the resolved entity's verlet body.
//   • setFlag     — writes the character's flag store (plain JSON, in state).
//   • idle        — return to the idle source.
//   • say/sfx/camera/emit/attach/detach — STUBBED: a single trace event
//                   (`intent:say`, …). The real performance/emitter/attachment layer
//                   is 7b / P9. Documented per verb below.
//   • branchOnFlag — TYPE exists; execution is 7b. In 7a it fails-with-trace (halt),
//                   so a doc that reaches it is never silently mis-run.
//
// ── 7b HOOK POINTS (called out for the next phase) ────────────────────────────────
//   H1 onStepEvent()   — every milestone the executor observes (start/arrived/blocked
//                        /failed/jump:launch/jump:land) funnels through here; 7b hangs
//                        reaction dispatch + cue scheduling off it.
//   H2 onBlockedOrFailed() — the single place a movement halt is decided; 7b replaces
//                        the halt with reaction lookup + give-up.
//   H3 stepTimeout     — `elapsedMs` per step is tracked; 7b compares to the intent's
//                        timeoutMs and fires onTimeout.
//   H4 busy latch      — `running()` is the force-release surface; 7b's watchdog wraps
//                        run()/advance() with the finished-latch semantics.

import type { BehaviorDoc, Intent, MovementVerb } from '@dash/schema'
import { clipDuration, parseTargetRef } from '@dash/schema'
import type { Clip, Pose } from '@dash/schema'
import { STEP_MS } from './loop'
import type { Blender } from './blender'
import type { EventBus } from './events'
import type { VerletWorld } from './verlet'
import type { MutableWorld } from './world/holes'
import type { Locomotion } from './locomotion'

const MOVEMENT: ReadonlySet<string> = new Set<MovementVerb>(['moveTo', 'jumpTo', 'flyTo', 'flyThrough'])
/** Default hold for strikePose / dwell for a loop playClip (ms). */
export const STRIKE_HOLD_MS = 600

export type BehaviorStatus = 'idle' | 'running' | 'complete' | 'halted'

export interface BehaviorState {
  behaviorId: string | null
  stepIndex: number
  status: BehaviorStatus
  /** ms remaining for the active timed step (wait/playClip/strikePose). */
  dwellMs: number
  /** ms elapsed in the active step (7b timeout accounting). */
  stepElapsedMs: number
  /** whether the active movement step has been begun on the solver. */
  moveStarted: boolean
  flags: Record<string, boolean>
}

export interface BehaviorDeps {
  locomotion: Locomotion
  blender: Blender
  verlet: VerletWorld
  world: MutableWorld
  events: EventBus
  characterId: string
  clips: Record<string, Clip>
  poses: Record<string, Pose>
  names?: { idle?: string }
  /** Resolve a target-ref / entity id to a verlet body id for impulse (self, prop). */
  resolveVerletBody?: (entityRef: string) => string | undefined
  /** BEHAVIOR REGISTRY (the P8 replay contract): id → doc, treated as immutable.
   * Snapshots store only `behaviorId` + step cursor; setState REBINDS the active doc
   * through this registry (an unknown id THROWS — loud, never a silently-wrong doc).
   * Docs passed to run() are auto-registered under their id (an id therefore names
   * ONE doc; re-registering a different doc under a used id also throws). A replaying
   * caller provides the map up front so a FRESH runtime can restore mid-behavior. */
  behaviors?: Record<string, BehaviorDoc>
}

export interface BehaviorExecutor {
  run(doc: BehaviorDoc): void
  /** Advance the active step by one tick. Call AFTER locomotion.postBlend so movement
   * status reflects this tick. */
  advance(): void
  readonly status: BehaviorStatus
  readonly flags: Record<string, boolean>
  running(): boolean
  getState(): BehaviorState
  setState(s: BehaviorState): void
}

export function createBehaviorExecutor(deps: BehaviorDeps): BehaviorExecutor {
  const { locomotion, blender, verlet, events, characterId } = deps
  const idleName = deps.names?.idle ?? 'idle'

  let doc: BehaviorDoc | null = null
  let stepIndex = 0
  let status: BehaviorStatus = 'idle'
  let dwellMs = 0
  let stepElapsedMs = 0
  let moveStarted = false
  let flags: Record<string, boolean> = {}

  // The behavior registry (see BehaviorDeps.behaviors). run() auto-registers; an id
  // maps to exactly one doc, ever — that is what makes `behaviorId` in a snapshot an
  // unambiguous reference (the P8 replay contract).
  const registry = new Map<string, BehaviorDoc>(Object.entries(deps.behaviors ?? {}))

  function register(behavior: BehaviorDoc): void {
    const existing = registry.get(behavior.id)
    if (existing !== undefined && existing !== behavior) {
      throw new Error(
        `behavior id '${behavior.id}' is already registered with a different doc — ids must be stable and unique (registry contract)`,
      )
    }
    registry.set(behavior.id, behavior)
  }

  function emit(type: string, extra: Record<string, unknown> = {}): void {
    events.emit(type, { characterId, ...extra })
  }

  function idleSource(): Pose | Clip {
    return deps.clips[idleName] ?? deps.poses[idleName] ?? { id: '__idle', angles: {} }
  }

  function run(behavior: BehaviorDoc): void {
    register(behavior)
    // Replacing a RUNNING behavior is an interruption: trace it, and ALWAYS reset the
    // locomotion solver — a stale marker-wait / blocked / failed movement state must
    // never leak into the new behavior's first step.
    if (status === 'running' && doc) {
      emit('behavior:interrupted', { behaviorId: doc.id, step: stepIndex })
    }
    locomotion.reset()
    doc = behavior
    stepIndex = 0
    status = 'running'
    dwellMs = 0
    stepElapsedMs = 0
    moveStarted = false
    emit('behavior:start', { behaviorId: behavior.id })
    enterStep()
  }

  /** Set up the current step (first-tick side effects). Movement is begun lazily in
   * advance() so its first tick is solved after the shared blender.tick(). */
  function enterStep(): void {
    if (!doc) return
    if (stepIndex >= doc.steps.length) {
      status = 'complete'
      emit('behavior:complete', { behaviorId: doc.id })
      return
    }
    dwellMs = 0
    stepElapsedMs = 0
    moveStarted = false
    const step = doc.steps[stepIndex]
    // instantaneous, non-movement side effects run immediately; timed ones set dwell.
    switch (step.verb) {
      case 'idle':
        blender.setSource(idleSource(), { durationMs: 200 })
        complete()
        break
      case 'playClip': {
        const clip = deps.clips[step.ref]
        if (!clip) return fail(`unknown-clip:${step.ref}`)
        blender.setSource(clip, { durationMs: step.blendMs ?? 200 })
        dwellMs = clip.loop ? STRIKE_HOLD_MS : Math.max(clipDuration(clip), STEP_MS)
        break
      }
      case 'strikePose': {
        const pose = deps.poses[step.ref] ?? deps.clips[step.ref]
        if (!pose) return fail(`unknown-pose:${step.ref}`)
        blender.setSource(pose as Pose | Clip, { durationMs: step.blendMs ?? 150 })
        dwellMs = step.holdMs ?? STRIKE_HOLD_MS
        // holdMs: 0 = strike and move on — a zero dwell completes NOW (a dwell of 0
        // would otherwise disable the countdown and wedge the behavior forever).
        if (dwellMs <= 0) complete()
        break
      }
      case 'wait':
        dwellMs = step.ms
        // wait {ms:0} completes immediately (same zero-dwell wedge).
        if (dwellMs <= 0) complete()
        break
      case 'impulse': {
        const bodyId = deps.resolveVerletBody?.(step.target)
        let applied = false
        if (bodyId) {
          verlet.applyImpulse(bodyId, step.vec[0], step.vec[1])
          applied = true
        }
        emit('intent:impulse', { target: step.target, vec: step.vec, applied })
        complete()
        break
      }
      case 'setFlag':
        flags[step.flag] = step.value ?? true
        emit('intent:setFlag', { flag: step.flag, value: flags[step.flag] })
        complete()
        break
      // ── stubs: typed + validated; a single trace event (real layer = 7b/P9) ──────
      case 'say':
        emit('intent:say', { text: step.text })
        complete()
        break
      case 'sfx':
        emit('intent:sfx', { kind: step.kind })
        complete()
        break
      case 'camera':
        emit('intent:camera', { to: step.to, ms: step.ms })
        complete()
        break
      case 'emit':
        emit('intent:emit', { emitter: step.emitter, count: step.count ?? 1 })
        complete()
        break
      case 'attach':
        emit('intent:attach', { target: step.target, point: step.point })
        complete()
        break
      case 'detach':
        emit('intent:detach', { target: step.target })
        complete()
        break
      // ── deferred: branchOnFlag execution is 7b ──────────────────────────────────
      case 'branchOnFlag':
        fail('branchOnFlag-deferred-7b')
        break
      // movement verbs: begun in advance() (see below)
      default:
        break
    }
  }

  function complete(): void {
    if (!doc) return
    const step = doc.steps[stepIndex]
    emit('intent:complete', { step: stepIndex, verb: step.verb })
    stepIndex++
    enterStep()
  }

  function fail(reason: string): void {
    if (!doc) return
    const step = doc.steps[stepIndex]
    emit('intent:failed', { step: stepIndex, verb: step.verb, reason })
    // H2: 7a HALTS on failure (7b: reaction / give-up dispatch replaces this).
    status = 'halted'
    emit('behavior:halted', { behaviorId: doc.id, step: stepIndex, reason })
  }

  function advance(): void {
    if (status !== 'running' || !doc) return
    if (stepIndex >= doc.steps.length) return
    const step = doc.steps[stepIndex]
    stepElapsedMs += STEP_MS // H3: 7b compares to step timeoutMs

    if (MOVEMENT.has(step.verb)) {
      if (!moveStarted) {
        locomotion.begin(step as Intent & { verb: MovementVerb })
        moveStarted = true
      }
      const st = locomotion.status
      if (st === 'arrived') {
        complete()
      } else if (st === 'blocked') {
        // H2: blocked halts the behavior in 7a (bounce reaction is 7b).
        emit('behavior:halted', { behaviorId: doc.id, step: stepIndex, reason: 'blocked' })
        status = 'halted'
      } else if (st === 'failed') {
        emit('behavior:halted', { behaviorId: doc.id, step: stepIndex, reason: 'movement-failed' })
        status = 'halted'
      }
      // 'running' → keep going next tick
      return
    }

    // timed non-movement steps (wait / playClip / strikePose): count down.
    if (dwellMs > 0) {
      dwellMs -= STEP_MS
      if (dwellMs <= 0) complete()
    }
  }

  return {
    run,
    advance,
    get status() {
      return status
    },
    get flags() {
      return flags
    },
    running() {
      return status === 'running'
    },
    getState() {
      return { behaviorId: doc?.id ?? null, stepIndex, status, dwellMs, stepElapsedMs, moveStarted, flags: { ...flags } }
    },
    setState(s: BehaviorState) {
      // REBIND through the registry (never a retained reference): a snapshot names
      // its behavior by id, and restore must work on a FRESH runtime — provided the
      // caller passed the doc via deps.behaviors (or ran it here earlier). An
      // unknown id is a hard error: executing a guessed/wrong doc would be worse
      // than crashing.
      if (s.behaviorId === null) {
        doc = null
      } else {
        const bound = registry.get(s.behaviorId)
        if (bound === undefined) {
          throw new Error(
            `BehaviorExecutor.setState: behavior '${s.behaviorId}' is not in the registry — pass it via deps.behaviors (P8 replay contract)`,
          )
        }
        doc = bound
      }
      stepIndex = s.stepIndex
      status = s.status
      dwellMs = s.dwellMs
      stepElapsedMs = s.stepElapsedMs
      moveStarted = s.moveStarted
      flags = { ...s.flags }
    },
  }
}

// Re-export so consumers can reference the parse helper alongside the executor.
export { parseTargetRef }
