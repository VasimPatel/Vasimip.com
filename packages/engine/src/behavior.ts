// Intent executor (L6) — Phase 7b: the FULL behavior runtime. Sequential execution
// of a BehaviorDoc's steps, plus reactions, performance cues, timeouts + give-up,
// branchOnFlag, and the speech bubble. (7a shipped the linear step executor + the
// H1–H4 hook points; 7b fills them in.)
//
// ── THE AUTHORING CONTRACT (read this before writing behavior content) ─────────────
//
// REACTIONS  `BehaviorDoc.reactions?: Partial<Record<ReactionTrigger, Intent[]>>` run
//   as a NESTED SUB-SEQUENCE (same executor, a pushed frame) when their trigger fires.
//   The resume-or-end policy is fixed by trigger:
//     • onBlocked / onTimeout  → the movement FAILED; the reaction is the authored
//       acknowledgment (e.g. [playClip bonk, say "ow!", impulse self backward]). After
//       it runs, the behavior ENDS and the character returns to safe idle.
//     • onArrive / onLand      → the movement SUCCEEDED / reached a beat; the reaction
//       runs, then the behavior CONTINUES to the next step.
//     • onHit / onDisturbed / onProjectileHit → fired from world/bus events; run as a
//       continue reaction (the behavior resumes what it was doing).
//   DEPTH CAP = 1 (by design): a reaction does NOT itself fire reactions. If a
//   reaction's own movement blocks / times out, that goes STRAIGHT to the end/watchdog
//   path with a `behavior:reaction-failed` trace — never a nested reaction.
//   Character-level defaults: `CharacterDoc.reactions?` is consulted only when the
//   running behavior has NO reaction for the trigger. Behavior-level always wins.
//
// CUES       `BehaviorDoc.cues?: { at: Milestone; do: Intent }[]` fire at intent
//   milestones (see cues.ts) and run CONCURRENTLY with the movement — they never enter
//   the step sequence. A movement verb in a cue is a schema validation error.
//
// TIMEOUTS   Each step is bounded (per-verb defaults below; movement `timeoutMs`
//   overrides). On expiry: cancel the movement, emit `intent:timeout`, run `onTimeout`
//   (or the DEFAULT GIVE-UP: a brief shrug/sit from existing poses), then END. An
//   arrival on the exact boundary tick WINS over the timeout. A hard movement FAILURE
//   (unreachable / route-stale / cannot-*) is not a give-up: it HALTS loudly (7a parity).
//
// WATCHDOG   Defense-in-depth (watchdog.ts) on top of the 7a invariant that every wait
//   is individually bounded. It force-releases a run that overruns its total bound.
//
// ── 7b HOOK POINTS (from 7a) ──────────────────────────────────────────────────────
//   H1 milestone events funnel through locomotion's emit()/LOCO_EVENTS + this file's
//      emit(); reactions/cues hang off them.  H2 the movement-conclusion switch in
//      advance() is the single reaction-dispatch choke point.  H3 per-frame
//      `stepElapsedMs` drives timeout accounting.  H4 `running()` + `forceRelease()`
//      are the watchdog's surfaces; `runId` keys its per-run latch.

import type { BehaviorDoc, Intent, MovementVerb, ReactionTrigger } from '@dash/schema'
import { clipDuration, parseTargetRef } from '@dash/schema'
import type { Clip, Pose } from '@dash/schema'
import { STEP_MS } from './loop'
import type { Blender } from './blender'
import type { EventBus } from './events'
import type { VerletWorld } from './verlet'
import type { MutableWorld } from './world/holes'
import type { Locomotion } from './locomotion'
import { createCueScheduler, type CueScheduler } from './cues'

const MOVEMENT: ReadonlySet<string> = new Set<MovementVerb>(['moveTo', 'jumpTo', 'flyTo', 'flyThrough'])
/** Default hold for strikePose / dwell for a loop playClip (ms). */
export const STRIKE_HOLD_MS = 600
/** Default per-step timeout for a movement verb without an explicit `timeoutMs` (ms). */
export const DEFAULT_MOVEMENT_TIMEOUT_MS = 8000
/** Slack added to a timed step's own duration to derive its timeout (ms) — the timeout
 * is a wedge-catcher; a healthy wait/pose always completes on its dwell first. */
export const TIMEOUT_SLACK_MS = 2000
/** Default lifetime of a speech bubble set by `say` (ms). */
export const SAY_DURATION_MS = 1400
/** Reaction allowance folded into the watchdog budget (ms). */
export const REACTION_ALLOWANCE_MS = 3000
/** Hard cap on nested frame depth (defensive; authored docs are far shallower). */
const MAX_STACK_DEPTH = 8

/** Reaction triggers that END the behavior after the reaction runs (vs continue). */
const END_AFTER: ReadonlySet<ReactionTrigger> = new Set<ReactionTrigger>(['onBlocked', 'onTimeout'])

/** Bus events that inject a CONTINUE reaction when they name this character. */
const BUS_TRIGGERS: { event: string; trigger: ReactionTrigger; idKey: 'characterId' | 'entity' }[] = [
  { event: 'jump:land', trigger: 'onLand', idKey: 'characterId' },
  { event: 'hit', trigger: 'onHit', idKey: 'entity' },
  { event: 'disturbed', trigger: 'onDisturbed', idKey: 'entity' },
  { event: 'projectileHit', trigger: 'onProjectileHit', idKey: 'entity' },
]

export type BehaviorStatus = 'idle' | 'running' | 'complete' | 'halted'

/** A speech bubble the renderer draws; decays every tick regardless of behavior state. */
export interface Speech {
  text: string
  remainingMs: number
}

/** One execution frame. The BOTTOM frame is the main sequence (`steps: null` → the
 * doc's steps, rebound via the registry on restore). Pushed frames (reactions,
 * branchOnFlag bodies, the give-up) carry their EMBEDDED intent list — self-contained
 * plain JSON, so snapshot/restore mid-reaction is exact. */
export interface BehaviorFrame {
  /** null = the main sequence (doc.steps); else an embedded sub-list. */
  steps: Intent[] | null
  index: number
  /** current step's first-tick side effects have run. */
  entered: boolean
  /** ms remaining for the active timed step (wait/playClip/strikePose). */
  dwellMs: number
  /** ms elapsed in the active step (timeout accounting, H3). */
  stepElapsedMs: number
  /** the active movement step has been begun on the solver. */
  moveStarted: boolean
  /** on drain, END the whole behavior (onBlocked/onTimeout reactions + give-up). */
  endAfter: boolean
  /** what to do to the PARENT when this (continue) frame drains. */
  onResume: 'complete' | 'resume' | null
  /** this frame is a reaction body — the depth-cap guard reads it (no nested reactions). */
  isReaction: boolean
  /** terminal reason to report when an endAfter frame concludes. */
  reason: string | null
  /** the global moveSeq stamped when THIS frame's movement began (0 = none yet). Lets
   * drainFrame detect that a nested frame RETASKED the (single) locomotion solver
   * while the parent's movement was in flight — the parent's solver state is gone,
   * so its movement must be cancelled and re-begun toward its original target. */
  moveSeq: number
}

export interface BehaviorState {
  behaviorId: string | null
  status: BehaviorStatus
  flags: Record<string, boolean>
  /** stack[0] = main sequence; pushes = reactions / branches / give-up. */
  stack: BehaviorFrame[]
  /** speech bubble (character-visible, decaying). */
  speech: Speech | null
  /** monotonic per-run id — the watchdog's per-run latch key (H4). */
  runId: number
  /** monotonic count of locomotion.begin() calls this run-lifetime (see BehaviorFrame.moveSeq). */
  moveSeq: number
  /** The run's watchdog time bound. REQUIRED for one-shot runs (doc = null →
   * nothing to recompute from; a fresh runtime would otherwise restore budget 0
   * and force-release on the next tick — review blocker). Optional so pre-parity
   * snapshots (doc-bound, recomputable) restore unchanged. */
  budget?: number
  /** onLaunch acting armed to release at the next jump:land (flight scope). Present
   * only when armed, so pre-parity-3 snapshots serialize byte-identically. */
  flightHold?: true
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
  /** Character-level DEFAULT reactions (behavior-level wins; §7b). */
  characterReactions?: Partial<Record<ReactionTrigger, Intent[]>>
  /** Conventional pose/clip names for the default give-up (shrug-and-sit). Both are
   * OPTIONAL and DEGRADE: a missing pose is simply skipped, so the give-up can never
   * wedge on absent content. Defaults: shrug='think', sit='squash-land'. */
  giveUp?: { shrug?: string; sit?: string }
  /** Resolve a target-ref / entity id to a verlet body id for impulse (self, prop). */
  resolveVerletBody?: (entityRef: string) => string | undefined
  /** Apply a REAL root recoil to the character transform for `impulse self` (the
   * character runtime provides it — a bounded, decaying, collision-respecting
   * displacement). Without it, a self-impulse only moves the cosmetic secondary. */
  applyRootImpulse?: (vx: number, vy: number) => void
  /** Set the character's horizontal facing (strikePose {face} — the v1 authored
   * arrival facing). The character runtime provides it (transform owner). */
  setFacing?: (face: 1 | -1) => void
  /** BEHAVIOR REGISTRY (the P8 replay contract): id → doc, immutable. Snapshots store
   * `behaviorId` + the frame stack; setState REBINDS the active doc through this
   * registry (an unknown id THROWS). Docs passed to run() are auto-registered. */
  behaviors?: Record<string, BehaviorDoc>
}

export interface BehaviorExecutor {
  run(doc: BehaviorDoc): void
  /** Run an EPHEMERAL one-shot steps list (dynamic quips/beats whose text varies per
   * invocation). Never touches the registry — snapshots store `behaviorId: null` plus
   * the inline frame steps, so restore is exact and repeated one-shots cannot violate
   * the registry identity contract. `label` is trace-only (events/reason). */
  runOneShot(label: string, steps: Intent[]): void
  /** Advance the active step by one tick. Call AFTER locomotion.postBlend. */
  advance(): void
  readonly status: BehaviorStatus
  readonly flags: Record<string, boolean>
  running(): boolean
  /** The current speech bubble (or null). */
  speech(): Speech | null
  /** Monotonic run id (watchdog latch key). */
  runId(): number
  /** Total time bound for the current run (watchdog budget). */
  budgetMs(): number
  /** Force the behavior to safe idle NOW (watchdog force-release). Cancels locomotion,
   * clears the stack, returns to idle. Emits nothing — the caller traces the release. */
  forceRelease(): void
  getState(): BehaviorState
  setState(s: BehaviorState): void
  dispose(): void
}

export function createBehaviorExecutor(deps: BehaviorDeps): BehaviorExecutor {
  const { locomotion, blender, verlet, events, characterId } = deps
  const idleName = deps.names?.idle ?? 'idle'
  const shrugName = deps.giveUp?.shrug ?? 'think'
  const sitName = deps.giveUp?.sit ?? 'squash-land'

  let doc: BehaviorDoc | null = null
  let status: BehaviorStatus = 'idle'
  let flags: Record<string, boolean> = {}
  let stack: BehaviorFrame[] = []
  let speech: Speech | null = null
  let runId = 0
  let budget = 0
  /** onLaunch acting is armed to release at the next jump:land (see the flight-scope block). */
  let flightHold = false
  /** Monotonic count of locomotion.begin() calls — the retasking detector (item: a
   * movement inside a continue-reaction replaces the parent's solver state). */
  let moveSeq = 0

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

  // ── frame helpers ───────────────────────────────────────────────────────────────
  const top = (): BehaviorFrame | undefined => stack[stack.length - 1]
  const stepsOf = (f: BehaviorFrame): Intent[] => f.steps ?? doc?.steps ?? []
  // The depth-cap gate: reactions dispatch whenever we are NOT already inside a
  // reaction frame — stack depth is NOT the test (a movement inside a branchOnFlag
  // body still gets its onArrive/onBlocked/onTimeout reactions).
  const inReaction = (): boolean => stack.some((f) => f.isReaction)

  function newFrame(steps: Intent[] | null, opts: Partial<BehaviorFrame> = {}): BehaviorFrame {
    return {
      steps,
      index: 0,
      entered: false,
      dwellMs: 0,
      stepElapsedMs: 0,
      moveStarted: false,
      endAfter: false,
      onResume: null,
      isReaction: false,
      reason: null,
      moveSeq: 0,
      ...opts,
    }
  }

  // ── reaction / give-up authoring ──────────────────────────────────────────────────
  /** Behavior-level reaction wins; else the character-level default. */
  function reactionFor(trigger: ReactionTrigger): Intent[] | undefined {
    return doc?.reactions?.[trigger] ?? deps.characterReactions?.[trigger]
  }

  /** The default give-up: a brief shrug then sit, using whatever of the two poses the
   * character actually has (missing ones are skipped — never a wedge). If neither
   * exists it degrades to an empty list (end → idle immediately). */
  function defaultGiveUp(): Intent[] {
    const steps: Intent[] = []
    if (deps.poses[shrugName] || deps.clips[shrugName]) steps.push({ verb: 'strikePose', ref: shrugName, holdMs: 450 })
    if (deps.poses[sitName] || deps.clips[sitName]) steps.push({ verb: 'strikePose', ref: sitName, holdMs: 650 })
    return steps
  }

  // ── run / restore ─────────────────────────────────────────────────────────────────
  function run(behavior: BehaviorDoc): void {
    register(behavior)
    if (status === 'running' && doc) {
      emit('behavior:interrupted', { behaviorId: doc.id, depth: stack.length })
    }
    clearFlightRelease()
    locomotion.reset()
    doc = behavior
    status = 'running'
    stack = [newFrame(null)]
    runId++
    budget = computeBudget(behavior)
    emit('behavior:start', { behaviorId: behavior.id })
    enterCurrent()
  }

  /** One-shot run: interrupt semantics match run() (reset locomotion, fresh stack,
   * watchdog re-armed), but the steps live INLINE in the frame and `doc` stays null —
   * nothing is registered. The frame is a reaction frame (bus reactions don't stack
   * inside it) that ends the run when it drains (`behavior:ended {reason: label}`). */
  function runOneShot(label: string, steps: Intent[]): void {
    if (status === 'running') {
      emit('behavior:interrupted', { behaviorId: doc?.id ?? top()?.reason ?? '__one-shot', depth: stack.length })
    }
    clearFlightRelease()
    locomotion.reset()
    doc = null
    status = 'running'
    stack = [newFrame(steps.map((s) => structuredClone(s)), { isReaction: true, endAfter: true, reason: label })]
    runId++
    budget = sumBound(steps) + REACTION_ALLOWANCE_MS + 1500
    emit('behavior:start', { behaviorId: label, oneShot: true })
    enterCurrent()
  }

  // ── enter / complete / drain (the cascade) ─────────────────────────────────────────
  /** Set up the current step of the TOP frame (first-tick side effects). Instantaneous
   * verbs cascade synchronously through complete(); timed/movement verbs yield to ticks. */
  function enterCurrent(): void {
    const f = top()
    if (!f || status !== 'running') return
    const steps = stepsOf(f)
    if (f.index >= steps.length) return void drainFrame()
    f.entered = true
    f.dwellMs = 0
    f.stepElapsedMs = 0
    f.moveStarted = false
    const step = steps[f.index]
    switch (step.verb) {
      case 'idle':
        blender.clearActing() // an explicit idle IS a new pose — release any persist
        blender.setSource(idleSource(), { durationMs: 200 })
        complete()
        break
      case 'playClip': {
        const clip = deps.clips[step.ref]
        if (!clip) return failStep(`unknown-clip:${step.ref}`)
        blender.clearActing() // a step-level clip takes the base — no stale overlay
        blender.setSource(clip, { durationMs: step.blendMs ?? 200 })
        f.dwellMs = clip.loop ? STRIKE_HOLD_MS : Math.max(clipDuration(clip), STEP_MS)
        break
      }
      case 'strikePose': {
        const pose = deps.poses[step.ref] ?? deps.clips[step.ref]
        if (!pose) return failStep(`unknown-pose:${step.ref}`)
        // Authored facing (v1 arrival face — the legacy Fight faces LEFT).
        if (step.face !== undefined) deps.setFacing?.(step.face)
        if (step.hold === 'persist') {
          // Persist-until-next-transition (the v1 arrival semantics): the pose rides
          // the ACTING layer and the step completes IMMEDIATELY — the character is
          // interactable (pokes, fidget gates see idle) while LOOKING like the pose.
          // Released by the next movement/pose step or forceRelease, never a timer.
          blender.setActing(pose as Pose | Clip, { durationMs: step.blendMs ?? 150, holdMs: 'persist' })
          complete()
          break
        }
        blender.clearActing() // a new pose supersedes any held one
        blender.setSource(pose as Pose | Clip, { durationMs: step.blendMs ?? 150 })
        f.dwellMs = step.holdMs ?? STRIKE_HOLD_MS
        if (f.dwellMs <= 0) complete()
        break
      }
      case 'wait':
        f.dwellMs = step.ms
        if (f.dwellMs <= 0) complete()
        break
      case 'impulse': {
        doImpulse(step)
        complete()
        break
      }
      case 'setFlag':
        flags[step.flag] = step.value ?? true
        emit('intent:setFlag', { flag: step.flag, value: flags[step.flag] })
        complete()
        break
      case 'say':
        doSay(step.text, step.holdMs)
        complete()
        break
      case 'sfx':
        emit('intent:sfx', { kind: step.kind })
        complete()
        break
      case 'camera':
        emit('intent:camera', { to: step.to, ms: step.ms, mult: step.mult, fast: step.fast })
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
      case 'branchOnFlag': {
        const taken = flags[step.flag] === true
        emit('intent:branch', { flag: step.flag, taken })
        const list = taken ? step.then : (step.else ?? [])
        if (list.length === 0) return void complete()
        if (stack.length >= MAX_STACK_DEPTH) return void endBehavior('halted', 'branch-depth-exceeded')
        // A branch is control flow: on drain, COMPLETE the branchOnFlag step (advance
        // the parent past it). Branches never fire reactions (depth cap / interplay).
        pushFrame(newFrame([...list], { onResume: 'complete' }))
        break
      }
      // movement verbs: begun lazily in advance() so the first tick is solved post-blend.
      default:
        break
    }
  }

  function complete(): void {
    const f = top()
    if (!f || status !== 'running') return
    const steps = stepsOf(f)
    const step = steps[f.index]
    emit('intent:complete', { step: f.index, verb: step.verb })
    f.index++
    f.entered = false
    if (f.index >= steps.length) return void drainFrame()
    enterCurrent()
  }

  /** A step could not run (unknown clip/pose) — a HARD failure: emit intent:failed and
   * halt (7a parity). A nested-frame failure halts too (depth cap). */
  function failStep(reason: string): void {
    const f = top()
    if (!f) return
    emit('intent:failed', { step: f.index, verb: stepsOf(f)[f.index]?.verb, reason })
    endBehavior('halted', inReaction() ? `reaction-failed:${reason}` : reason)
  }

  /** Pop the drained top frame and resume per its policy. */
  function drainFrame(): void {
    const f = stack.pop()
    if (!f) return void endBehavior('complete', null)
    if (f.endAfter) return void endBehavior('complete', f.reason)
    if (stack.length === 0) return void endBehavior('complete', null)
    const parent = top()!
    if (f.onResume === 'complete') {
      // the parent's step (movement that arrived, or a branchOnFlag) is now done.
      complete()
    } else {
      // 'resume': the parent step keeps running (a mid-movement reaction just finished).
      // RETASKING REPAIR: there is ONE locomotion solver. If the drained frame (or a
      // frame pushed above it) began its own movement, the solver no longer holds the
      // parent's movement — its terminal status would be misread as the parent's.
      // Detect via moveSeq (global counter vs the parent's stamp) and cancel + re-begin:
      // the parent movement re-resolves its ORIGINAL target from the current position
      // on the next advance (a fresh intent:start is traced — deliberate).
      const pstep = stepsOf(parent)[parent.index]
      if (pstep && MOVEMENT.has(pstep.verb) && parent.moveStarted && parent.moveSeq !== moveSeq) {
        locomotion.reset()
        parent.moveStarted = false
      }
      // re-enter only if the parent step never got its side effects (defensive).
      if (!parent.entered) enterCurrent()
    }
  }

  function pushFrame(f: BehaviorFrame): void {
    stack.push(f)
    enterCurrent()
  }

  // ── terminal ────────────────────────────────────────────────────────────────────
  function endBehavior(terminal: 'complete' | 'halted', reason: string | null): void {
    clearFlightRelease()
    const id = doc?.id ?? null
    status = terminal
    stack = []
    // CANCEL an in-flight movement: `running()` going false MUST mean the character
    // stops — a behavior that ends mid-walk/fly must not keep the solver driving the
    // transform. Terminal solver states (arrived/blocked/failed) are inert and are
    // deliberately preserved for the trace/tests.
    if (locomotion.status === 'running') locomotion.reset()
    // GUARANTEE return to safe idle — the behavior-level defense (watchdog is the
    // deeper one). A reaction may have left a bonk pose / backward drift; idle here.
    blender.setSource(idleSource(), { durationMs: 200 })
    if (terminal === 'complete' && reason === null) emit('behavior:complete', { behaviorId: id })
    else if (terminal === 'complete') emit('behavior:ended', { behaviorId: id, reason })
    else emit('behavior:halted', { behaviorId: id, reason })
  }

  // ── reaction dispatch (the H2 choke point) ──────────────────────────────────────
  /** Run a reaction for `trigger` as a nested frame. `end` = end the behavior after it
   * (onBlocked/onTimeout); else it's a CONTINUE reaction and `onResume` says what to do
   * to the parent on drain ('complete' = advance the parent's arrived movement step;
   * 'resume' = leave the parent step running). Depth cap: never fires inside a reaction. */
  function runReaction(
    trigger: ReactionTrigger,
    list: Intent[],
    opts: { end: boolean; reason?: string; onResume?: 'complete' | 'resume' },
  ): void {
    emit('reaction:run', { trigger, count: list.length, end: opts.end })
    if (list.length === 0) {
      // No steps: honor the policy directly (end, or continue by advancing the parent).
      if (opts.end) endBehavior('complete', opts.reason ?? trigger)
      else if (opts.onResume === 'complete') complete()
      return
    }
    pushFrame(
      newFrame([...list], {
        isReaction: true,
        endAfter: opts.end,
        reason: opts.end ? (opts.reason ?? trigger) : null,
        onResume: opts.end ? null : (opts.onResume ?? 'resume'),
      }),
    )
  }

  /** A movement in a NON-REACTION frame (main sequence or a branch body) was BLOCKED.
   * Run onBlocked (end), else just halt. */
  function concludeBlocked(): void {
    const r = reactionFor('onBlocked')
    if (r) runReaction('onBlocked', r, { end: true, reason: 'blocked' })
    else endBehavior('halted', 'blocked')
  }

  /** A step TIMED OUT (the give-up path): CANCEL the timed-out movement first — the
   * character must stop moving the moment the timeout concludes, not keep walking
   * through the give-up — then run onTimeout (or the default shrug-and-sit); either
   * way the behavior ends gracefully. A hard movement FAILURE (unreachable/route-
   * stale) is NOT a give-up — it halts (7a parity), handled inline in advance(). */
  function concludeTimeout(reason: string): void {
    if (locomotion.status === 'running') locomotion.reset()
    const r = reactionFor('onTimeout')
    runReaction('onTimeout', r ?? defaultGiveUp(), { end: true, reason })
  }

  /** A movement in a non-reaction frame ARRIVED. Run onArrive (continue) then advance;
   * else just advance to the next step. */
  function concludeArrived(): void {
    const r = reactionFor('onArrive')
    if (r && r.length > 0) runReaction('onArrive', r, { end: false, onResume: 'complete' })
    else complete()
  }

  /** IDLE-CHARACTER reactions (item: a rule's promised intent / a projectile hit must
   * not be discarded just because no behavior is running). Runs an EPHEMERAL one-shot
   * frame: the character becomes 'running' for the reaction's duration, then returns
   * to idle via the normal end path. Uses CHARACTER-LEVEL reactions only — a completed
   * behavior's doc-level reactions do not outlive the behavior. A fresh runId arms the
   * watchdog latch; the budget is the reaction's own bound. */
  function runIdle(source: string, list: Intent[]): void {
    doc = null // the ephemeral run belongs to no behavior doc
    status = 'running'
    runId++
    budget = sumBound(list) + REACTION_ALLOWANCE_MS + 1500
    stack = [newFrame(list.map((s) => structuredClone(s)), { isReaction: true, endAfter: true, reason: source })]
    enterCurrent()
  }

  // ── say / impulse execution ───────────────────────────────────────────────────────
  function doSay(text: string, holdMs?: number): void {
    const ms = holdMs ?? SAY_DURATION_MS
    speech = { text, remainingMs: ms }
    emit('intent:say', { text, ms })
  }

  function doImpulse(step: Extract<Intent, { verb: 'impulse' }>): void {
    const bodyId = deps.resolveVerletBody?.(step.target)
    let applied = false
    if (bodyId) {
      verlet.applyImpulse(bodyId, step.vec[0], step.vec[1])
      applied = true
    }
    // `impulse self` also moves the CHARACTER ROOT — a real recoil, not just the
    // cosmetic secondary follow-through (the Wall Test's knockback must displace the
    // transform). The runtime integrates it bounded + collision-swept.
    if (step.target === 'self' && deps.applyRootImpulse) {
      deps.applyRootImpulse(step.vec[0], step.vec[1])
      applied = true
    }
    emit('intent:impulse', { target: step.target, vec: step.vec, applied })
  }

  // ── per-tick advance ──────────────────────────────────────────────────────────────
  function advance(): void {
    // Speech decays every tick, even after the behavior ends (the bubble lingers out).
    if (speech) {
      speech.remainingMs -= STEP_MS
      if (speech.remainingMs <= 0) speech = null
    }
    if (status !== 'running') return
    const f = top()
    if (!f) return
    const steps = stepsOf(f)
    if (f.index >= steps.length) return void drainFrame()
    if (!f.entered) {
      // a resumed movement frame may need entering (defensive; normal paths enter eagerly).
      enterCurrent()
      return
    }
    const step = steps[f.index]
    f.stepElapsedMs += STEP_MS

    if (MOVEMENT.has(step.verb)) {
      if (!f.moveStarted) {
        // A movement is "the next transition": a persist-held arrival pose releases
        // here (v1 semantics — the pose survived pokes/quips but not real travel).
        blender.clearActing()
        locomotion.begin(step as Intent & { verb: MovementVerb })
        f.moveStarted = true
        moveSeq++
        f.moveSeq = moveSeq
        // Move-scoped ACTING pose (v1 rope/slide/tightrope crossings): the figure
        // holds the art while the root travels; released when the move concludes
        // (any terminal path funnels through the next enterCurrent/endBehavior,
        // both of which clear or replace acting — plus the explicit clear below).
        const actingRef = (step as { pose?: string }).pose
        if (actingRef) {
          const src = deps.poses[actingRef] ?? deps.clips[actingRef]
          if (src) blender.setActing(src as Pose | Clip, { durationMs: 180, holdMs: 'persist' })
        }
      }
      // Terminal solver status FIRST, timeout second: an arrival on the exact
      // timeout-boundary tick is an arrival, never a timeout.
      const st = locomotion.status
      // A move-scoped acting pose releases the moment ITS move concludes — the
      // next step may be a non-clearing beat (sfx/say) that must show the figure
      // landing, not still frozen in the crossing art.
      if (st !== 'running' && (step as { pose?: string }).pose) blender.clearActing()
      if (st === 'arrived') {
        if (!inReaction()) concludeArrived()
        else complete()
      } else if (st === 'blocked') {
        if (!inReaction()) concludeBlocked()
        else endBehavior('halted', 'reaction-blocked')
      } else if (st === 'failed') {
        // hard movement failure (unreachable / route-stale / cannot-*): HALT (7a parity).
        // locomotion already emitted intent:failed with the specific reason + set idle.
        endBehavior('halted', inReaction() ? 'reaction-movement-failed' : 'movement-failed')
      } else if (f.stepElapsedMs >= movementTimeout(step)) {
        // timeout: bounded even if the solver's own bounds somehow don't bite → give-up.
        // A move-scoped acting pose leaves with its move here too (review: an empty
        // onTimeout reaction would otherwise strand the crossing art persistently).
        if ((step as { pose?: string }).pose) blender.clearActing()
        emit('intent:timeout', { step: f.index, verb: step.verb })
        if (!inReaction()) concludeTimeout('timeout')
        else endBehavior('halted', 'reaction-timeout')
      }
      return
    }

    // timed non-movement steps (wait / playClip / strikePose): dwell + timeout guard.
    if (f.dwellMs > 0) {
      f.dwellMs -= STEP_MS
      if (f.dwellMs <= 0) return void complete()
    }
    if (f.stepElapsedMs >= timedTimeout(step)) {
      emit('intent:timeout', { step: f.index, verb: step.verb })
      if (!inReaction()) concludeTimeout('timeout')
      else endBehavior('halted', 'reaction-timeout')
    }
  }

  // ── timeout / budget math ───────────────────────────────────────────────────────
  function movementTimeout(step: Intent): number {
    return (step as { timeoutMs?: number }).timeoutMs ?? DEFAULT_MOVEMENT_TIMEOUT_MS
  }
  function timedTimeout(step: Intent): number {
    if (step.verb === 'wait') return step.ms + TIMEOUT_SLACK_MS
    if (step.verb === 'playClip') {
      const clip = deps.clips[step.ref]
      const dur = clip ? (clip.loop ? STRIKE_HOLD_MS : Math.max(clipDuration(clip), STEP_MS)) : STRIKE_HOLD_MS
      return dur + TIMEOUT_SLACK_MS
    }
    if (step.verb === 'strikePose') return (step.holdMs ?? STRIKE_HOLD_MS) + TIMEOUT_SLACK_MS
    return TIMEOUT_SLACK_MS // instantaneous verbs never really tick here
  }
  /** Upper bound on a step's contribution to the total run bound. */
  function stepBound(step: Intent): number {
    if (MOVEMENT.has(step.verb)) return movementTimeout(step)
    if (step.verb === 'branchOnFlag') {
      const t = sumBound(step.then)
      const e = step.else ? sumBound(step.else) : 0
      return Math.max(t, e)
    }
    if (step.verb === 'wait' || step.verb === 'playClip' || step.verb === 'strikePose') return timedTimeout(step)
    return STEP_MS
  }
  function sumBound(steps: Intent[]): number {
    let s = 0
    for (const st of steps) s += stepBound(st)
    return s
  }
  /** The total time bound for a run (legacy `total + 1500` idiom, generalized). */
  function computeBudget(behavior: BehaviorDoc): number {
    return sumBound(behavior.steps) + REACTION_ALLOWANCE_MS + 1500
  }

  // ── watchdog surface ────────────────────────────────────────────────────────────
  function forceRelease(): void {
    clearFlightRelease()
    locomotion.reset()
    stack = []
    status = 'idle'
    blender.clearActing({ durationMs: 120 })
    blender.setSource(idleSource(), { durationMs: 120 })
  }

  // ── bus-driven reactions (onLand / onHit / onDisturbed / onProjectileHit) and the
  // rule-table `intent` response. While a behavior RUNS they inject a continue
  // reaction (skipped inside a reaction — depth cap 1). While IDLE they run as an
  // ephemeral one-shot (character-level reactions only) so a rule's promised intent
  // is never discarded.
  const busUnsubs: Array<() => void> = []
  for (const { event, trigger, idKey } of BUS_TRIGGERS) {
    busUnsubs.push(
      events.on(event, (payload) => {
        if ((payload as Record<string, string>)?.[idKey] !== characterId) return
        if (status === 'running') {
          if (inReaction()) return
          const r = reactionFor(trigger)
          if (r && r.length > 0) runReaction(trigger, r, { end: END_AFTER.has(trigger), reason: trigger, onResume: 'resume' })
        } else {
          const r = deps.characterReactions?.[trigger]
          if (r && r.length > 0) {
            emit('reaction:run', { trigger, count: r.length, end: true, idle: true })
            runIdle(`idle:${trigger}`, r)
          }
        }
      }),
    )
  }
  // rule:intent — a RuleRow `intent` response targeted at this character (§7b #4).
  busUnsubs.push(
    events.on('rule:intent', (payload) => {
      const p = payload as { entity?: string; intent?: Intent }
      if (p?.entity !== characterId || !p.intent) return
      if (status === 'running') {
        if (inReaction()) return
        // run the single intent as a one-shot continue reaction.
        pushFrame(newFrame([p.intent], { isReaction: true, onResume: 'resume' }))
      } else {
        // idle: execute the rule's intent as an ephemeral one-shot, then re-idle.
        runIdle('idle:rule-intent', [p.intent])
      }
    }),
  )

  // ── performance-cue scheduler ─────────────────────────────────────────────────────
  // FLIGHT-SCOPED acting (parity 3 — the excessive-rolling fix): an onLaunch
  // strikePose/playClip cue releases its acting at the NEXT landing, whichever
  // of {jump:land, holdMs} comes first. Without this, a roll's 900ms tuck
  // outlived a ~460ms hop and kept tucking through the walk legs of multi-leg
  // routes. The arm is a SERIALIZED flag checked by a permanent subscription
  // (never a dynamically-attached listener) so a mid-flight snapshot/restore
  // releases on the identical tick. Cleared on any run/end/forceRelease so it
  // can never release a LATER behavior's acting.
  function clearFlightRelease(): void {
    flightHold = false
  }
  function armFlightRelease(): void {
    flightHold = true
  }
  busUnsubs.push(
    events.on('jump:land', (p) => {
      if (!flightHold) return
      if ((p as { characterId?: string })?.characterId !== characterId) return
      flightHold = false
      blender.clearActing()
    }),
  )

  const cueScheduler: CueScheduler = createCueScheduler({
    events,
    characterId,
    cues: () => doc?.cues ?? [],
    running: () => status === 'running',
    execCue: (intent, at) => {
      // Cues run CONCURRENTLY (never on the step stack). say drives the bubble;
      // strikePose/playClip act on the blender's ACTING layer (parity recovery,
      // Stage 2a — the review's core gap: these were trace-only, so vault/roll/
      // swing/smash cues rendered nothing); sfx/camera emit for the site adapter.
      // Schema validation restricts cue verbs to EXACTLY this performance subset
      // (CUE_VERBS) — the default arm is pure defense against hand-built docs that
      // bypassed validation, and traces loudly rather than acts.
      switch (intent.verb) {
        case 'say':
          doSay(intent.text, intent.holdMs)
          break
        case 'sfx':
          emit('intent:sfx', { kind: intent.kind, cue: true })
          break
        case 'camera':
          emit('intent:camera', { to: intent.to, ms: intent.ms, mult: intent.mult, fast: intent.fast, cue: true })
          break
        case 'strikePose': {
          const pose = deps.poses[intent.ref] ?? deps.clips[intent.ref]
          if (pose) {
            blender.setActing(pose as Pose | Clip, {
              durationMs: intent.blendMs ?? 160,
              holdMs: intent.hold === 'persist' ? 'persist' : (intent.holdMs ?? STRIKE_HOLD_MS),
            })
            if (at === 'onLaunch') armFlightRelease()
          }
          emit('cue:strikePose', { ref: intent.ref, acted: pose !== undefined })
          break
        }
        case 'playClip': {
          const clip = deps.clips[intent.ref]
          if (clip) {
            // A cue clip plays ONCE over the movement (looping clips get one cycle).
            blender.setActing(clip, { durationMs: intent.blendMs ?? 160, holdMs: Math.max(clipDuration(clip), STEP_MS) })
            if (at === 'onLaunch') armFlightRelease()
          }
          emit('cue:playClip', { ref: intent.ref, acted: clip !== undefined })
          break
        }
        default:
          emit('cue:ignored', { verb: intent.verb })
      }
    },
  })

  return {
    run,
    runOneShot,
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
    speech: () => speech,
    runId: () => runId,
    budgetMs: () => budget,
    forceRelease,
    getState(): BehaviorState {
      return {
        behaviorId: doc?.id ?? null,
        status,
        flags: { ...flags },
        stack: stack.map((f) => ({ ...f, steps: f.steps ? f.steps.map((s) => structuredClone(s)) : null })),
        speech: speech ? { ...speech } : null,
        runId,
        moveSeq,
        budget,
        ...(flightHold ? { flightHold: true as const } : {}),
      }
    },
    setState(s: BehaviorState) {
      if (s.behaviorId === null) {
        doc = null
        // one-shot (docless) runs carry their budget in the snapshot; a pre-parity
        // snapshot with a null doc is an idle state (budget irrelevant).
        budget = s.budget ?? 0
      } else {
        const bound = registry.get(s.behaviorId)
        if (bound === undefined) {
          throw new Error(
            `BehaviorExecutor.setState: behavior '${s.behaviorId}' is not in the registry — pass it via deps.behaviors (P8 replay contract)`,
          )
        }
        doc = bound
        budget = s.budget ?? computeBudget(bound)
      }
      status = s.status
      flags = { ...s.flags }
      stack = s.stack.map((f) => ({ ...f, steps: f.steps ? f.steps.map((st) => structuredClone(st)) : null }))
      speech = s.speech ? { ...s.speech } : null
      runId = s.runId
      moveSeq = s.moveSeq
      flightHold = s.flightHold ?? false
    },
    dispose() {
      clearFlightRelease()
      cueScheduler.dispose()
      for (const u of busUnsubs) u()
      busUnsubs.length = 0
    },
  }
}

// Re-export so consumers can reference the parse helper alongside the executor.
export { parseTargetRef }
