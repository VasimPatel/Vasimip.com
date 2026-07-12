// simulate() — the stable, browser-free, JSON-in/JSON-out entry point that builds
// the FULL runtime stack (mutable world + shared verlet + per-character runtimes +
// each runtime's OWNED watchdog) and runs a behavior to a terminal event. This is
// the substrate a future MCP tool wraps 1:1 (ENGINE_V2 Phase 8): keep it small and
// documented. Determinism is guaranteed BY CONSTRUCTION — the ENTIRE input is
// structuredClone'd once up front (no field of the caller's object is ever read
// again, so a callback mutating it mid-run cannot touch the sim), the seeded RNG is
// the only entropy, and nothing here reads a wall clock (the optional shouldAbort
// hook lives in the caller, where wall clock is legal; the engine never sees it).
//
// ── HARDENING (P8 review) ────────────────────────────────────────────────────────
// 1. COMPLEXITY CAPS, validated up front on the RAW input (before cloning — an
//    over-cap payload is rejected without paying for its copy): see MAX_* below.
//    They bound the quadratic pieces (traversal build, collision segment sets) so a
//    valid input can never make setup itself the runaway.
// 2. EVERY nested doc (character, rig, behaviors, poses, clips, restPose) passes its
//    schema validator before construction — pose/clip against the spec's rig.
// 3. Registries built with a null prototype: '__proto__' as a behavior/pose/clip id
//    is an inert, ordinary key — never prototype pollution.
// 4. shouldAbort is threaded through SETUP too (between construction stages), not
//    just between ticks — the caller's wall-clock deadline covers the whole call.

import {
  tryValidateWorldV2,
  tryValidateCharacter,
  tryValidateRig,
  tryValidateBehavior,
  validatePoseAgainstRig,
  validateClipAgainstRig,
  type WorldDocV2,
  type CharacterDoc,
  type RigTemplate,
  type Pose,
  type Clip,
  type BehaviorDoc,
} from '@dash/schema'
import {
  createContext,
  createVerletWorld,
  createMutableWorld,
  createCharacterRuntime,
  hashState,
  STEP_MS,
  type TraceEvent,
  type CharacterState,
  type CharacterTransform,
  type MutableWorldState,
  type VerletState,
} from '@dash/engine'

/** Default tick cap when the caller omits maxTicks. */
export const DEFAULT_MAX_TICKS = 12_000
/** Hard cap the runtime NEVER exceeds, whatever the caller asks for. */
export const HARD_MAX_TICKS = 60_000

// ── complexity caps (P8 review — documented, enforced up front) ──────────────────────
/** Max world entities (traversal/collision are O(n²)-ish in panels; 200 ≫ any page). */
export const MAX_ENTITIES = 200
/** Max collidable segments per entity (a panel is 4; holes add a handful). */
export const MAX_SEGMENTS_PER_ENTITY = 64
/** Max character specs per sim. */
export const MAX_CHARACTERS = 8
/** Max behavior docs in the registry. */
export const MAX_BEHAVIORS = 64
/** Max steps per behavior, per reaction list, and cues per behavior. */
export const MAX_BEHAVIOR_STEPS = 64
/** Max named poses + clips per character spec (each). */
export const MAX_LIBRARY_DOCS = 64

/** Conventional clip/pose names the locomotion solver looks up (mirrors the runtime). */
export interface CharacterNames {
  idle?: string
  walk?: string
  jump?: string
  jumpLand?: string
  tuck?: string
  fly?: string
}

/**
 * One character to instantiate into the sim, fully as data. Everything the
 * CharacterRuntime needs is here so simulate() stays JSON-pure — the caller (or MCP
 * tool) supplies the rig + content docs; simulate never reads the filesystem.
 */
export interface CharacterSpec {
  character: CharacterDoc
  rig: RigTemplate
  poses?: Record<string, Pose>
  clips?: Record<string, Clip>
  names?: CharacterNames
  restPose?: Pose
  initialTransform?: CharacterTransform
  /** Snap the character's feet (capsule bottom) onto this world Y after construction
   *  (the headless equivalent of the test harness's snapFeet). Applied post-build so
   *  the capsule can be measured from the rig. */
  initialFeetY?: number
  secondaryId?: string
  giveUp?: { shrug?: string; sit?: string }
  /** Watchdog override (mainly tests / hard caps); the runtime OWNS + TICKS it. */
  watchdog?: { maxBehaviorMs?: number }
}

export interface SimulateInput {
  world: WorldDocV2
  characters?: CharacterSpec[]
  behaviors?: BehaviorDoc[]
  /** The single behavior to drive; the sim runs until it reaches a terminal event. */
  run?: { characterId: string; behaviorId: string }
  /** Overrides world.seed for the RNG. */
  seed?: number
  /** Tick cap (default DEFAULT_MAX_TICKS, hard-capped at HARD_MAX_TICKS). */
  maxTicks?: number
}

/**
 * Coarse terminal classification derived from the trace:
 *   complete  — behavior:complete (clean run, no reason)
 *   ended     — behavior:ended (graceful end WITH a reason, e.g. an onBlocked reaction)
 *   halted    — behavior:halted (an intent failed — a real failure)
 *   watchdog  — watchdog:forced-release fired (runaway content force-released)
 *   maxticks  — the tick cap was hit with the behavior still running (never terminated)
 *   aborted   — the caller's shouldAbort guard tripped (route wall-clock guard); can
 *               fire DURING SETUP (ticks = 0) as well as between ticks
 *   idle      — no run was requested (or nothing ran); the sim just advanced
 */
export type Outcome = 'complete' | 'ended' | 'halted' | 'watchdog' | 'maxticks' | 'aborted' | 'idle'

/** The TOTAL serializable snapshot — enough to resume a bit-identical sim (§3 rule 1). */
export interface FinalState {
  /** Sim tick reached. */
  tick: number
  /** RNG state (the only entropy source) — folded into the hash + resumable. */
  rng: number
  /** World mutations (holes + heal timers). */
  world: MutableWorldState
  /** The one shared verlet world (secondary follow-through + props + ropes). */
  verlet: VerletState
  /** Per-character runtime state (transform, locomotion, behavior, blender,
   *  controllers, recoil, AND the runtime-owned watchdog window). */
  characters: { id: string; state: CharacterState }[]
}

export interface SimulateResult {
  trace: TraceEvent[]
  finalState: FinalState
  /** Bit-exact hash of finalState (float bit patterns, never decimal strings). */
  hash: string
  /** Ticks actually simulated. */
  ticks: number
  outcome: Outcome
}

export interface SimulateOptions {
  /** Route-layer wall-clock guard, checked during SETUP (between construction stages)
   *  and BETWEEN ticks. Returning true aborts (outcome 'aborted', partial trace; tick 0
   *  if setup never finished). The engine itself never reads a clock — this closure
   *  lives in the caller (e.g. the server route measuring Date.now). */
  shouldAbort?: (progress: { tick: number; events: number }) => boolean
}

function clampTicks(n: number | undefined): number {
  const v = n === undefined || !Number.isFinite(n) ? DEFAULT_MAX_TICKS : Math.floor(n)
  return Math.max(1, Math.min(HARD_MAX_TICKS, v))
}

/** Copy `src`'s entries onto a null-prototype record: every key — including
 *  '__proto__' — is an inert own property (P8 review fix 6). */
function nullProtoRecord<T>(src: Record<string, T> | undefined): Record<string, T> {
  const out: Record<string, T> = Object.create(null)
  if (src) for (const k of Object.keys(src)) out[k] = src[k]
  return out
}

// ── up-front complexity caps (checked on the RAW input, before any cloning) ──────────
function checkCaps(input: SimulateInput): void {
  const fail = (msg: string): never => {
    throw new Error(`simulate: complexity cap exceeded — ${msg}`)
  }
  const world = input.world as unknown
  if (world && typeof world === 'object' && Array.isArray((world as { entities?: unknown }).entities)) {
    const entities = (world as { entities: unknown[] }).entities
    if (entities.length > MAX_ENTITIES) fail(`world has ${entities.length} entities (max ${MAX_ENTITIES})`)
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i] as { components?: { collidable?: { segments?: unknown[] } } } | null
      const segs = e?.components?.collidable?.segments
      if (Array.isArray(segs) && segs.length > MAX_SEGMENTS_PER_ENTITY) {
        fail(`entities[${i}] has ${segs.length} collidable segments (max ${MAX_SEGMENTS_PER_ENTITY})`)
      }
    }
  }
  if (input.characters && input.characters.length > MAX_CHARACTERS) {
    fail(`${input.characters.length} character specs (max ${MAX_CHARACTERS})`)
  }
  for (const [ci, spec] of (input.characters ?? []).entries()) {
    const nPoses = spec?.poses ? Object.keys(spec.poses).length : 0
    const nClips = spec?.clips ? Object.keys(spec.clips).length : 0
    if (nPoses > MAX_LIBRARY_DOCS) fail(`characters[${ci}] has ${nPoses} poses (max ${MAX_LIBRARY_DOCS})`)
    if (nClips > MAX_LIBRARY_DOCS) fail(`characters[${ci}] has ${nClips} clips (max ${MAX_LIBRARY_DOCS})`)
  }
  if (input.behaviors && input.behaviors.length > MAX_BEHAVIORS) {
    fail(`${input.behaviors.length} behavior docs (max ${MAX_BEHAVIORS})`)
  }
  for (const [bi, b] of (input.behaviors ?? []).entries()) {
    const doc = b as unknown as { steps?: unknown[]; reactions?: Record<string, unknown[]>; cues?: unknown[] } | null
    if (Array.isArray(doc?.steps) && doc.steps.length > MAX_BEHAVIOR_STEPS) {
      fail(`behaviors[${bi}] has ${doc.steps.length} steps (max ${MAX_BEHAVIOR_STEPS})`)
    }
    if (doc?.reactions && typeof doc.reactions === 'object') {
      for (const trig of Object.keys(doc.reactions)) {
        const list = doc.reactions[trig]
        if (Array.isArray(list) && list.length > MAX_BEHAVIOR_STEPS) {
          fail(`behaviors[${bi}].reactions.${trig} has ${list.length} intents (max ${MAX_BEHAVIOR_STEPS})`)
        }
      }
    }
    if (Array.isArray(doc?.cues) && doc.cues.length > MAX_BEHAVIOR_STEPS) {
      fail(`behaviors[${bi}] has ${doc.cues.length} cues (max ${MAX_BEHAVIOR_STEPS})`)
    }
  }
}

// ── nested doc validation (P8 review fix 6 — nothing unvalidated reaches the engine) ─
function validateSpecs(specs: CharacterSpec[], behaviors: BehaviorDoc[]): void {
  const fail = (what: string, errors: string[]): never => {
    throw new Error(`simulate: invalid ${what}:\n- ${errors.join('\n- ')}`)
  }
  for (const [ci, spec] of specs.entries()) {
    const rv = tryValidateRig(spec.rig)
    if (!rv.ok) fail(`characters[${ci}].rig`, rv.errors)
    const cv = tryValidateCharacter(spec.character)
    if (!cv.ok) fail(`characters[${ci}].character`, cv.errors)
    for (const id of Object.keys(spec.poses ?? {})) {
      const pv = validatePoseAgainstRig((spec.poses as Record<string, Pose>)[id], spec.rig)
      if (!pv.ok) fail(`characters[${ci}].poses['${id}']`, pv.errors)
    }
    for (const id of Object.keys(spec.clips ?? {})) {
      const kv = validateClipAgainstRig((spec.clips as Record<string, Clip>)[id], spec.rig)
      if (!kv.ok) fail(`characters[${ci}].clips['${id}']`, kv.errors)
    }
    if (spec.restPose) {
      const pv = validatePoseAgainstRig(spec.restPose, spec.rig)
      if (!pv.ok) fail(`characters[${ci}].restPose`, pv.errors)
    }
  }
  for (const [bi, b] of behaviors.entries()) {
    const bv = tryValidateBehavior(b)
    if (!bv.ok) fail(`behaviors[${bi}]`, bv.errors)
  }
}

export function simulate(rawInput: SimulateInput, opts: SimulateOptions = {}): SimulateResult {
  // 1. Caps on the RAW input — an over-cap payload rejects before we pay to clone it.
  checkCaps(rawInput)

  // 2. Clone the COMPLETE input ONCE (fix 7). From here on the caller's object is
  //    never read again — a shouldAbort callback mutating it cannot affect the sim.
  const input: SimulateInput = structuredClone(rawInput)

  const abortedDuringSetup = (): boolean => opts.shouldAbort?.({ tick: 0, events: 0 }) === true

  // 3. Validate the world + every nested doc (fix 6) — all on the clone.
  const wv = tryValidateWorldV2(input.world)
  if (!wv.ok) throw new Error(`simulate: invalid world doc:\n- ${wv.errors.join('\n- ')}`)
  const specs = input.characters ?? []
  const behaviorDocs = input.behaviors ?? []
  validateSpecs(specs, behaviorDocs)

  const worldDoc: WorldDocV2 = wv.doc
  const seed = input.seed ?? worldDoc.seed
  const maxTicks = clampTicks(input.maxTicks)

  // Null-prototype behavior registry: '__proto__' as an id is inert (fix 6).
  const behaviors: Record<string, BehaviorDoc> = Object.create(null)
  for (const b of behaviorDocs) behaviors[b.id] = b

  const ctx = createContext({ seed })
  const verlet = createVerletWorld()

  // Setup-stage abort check (blocker 2): the wall-clock guard covers construction too.
  if (abortedDuringSetup()) return abortedResult(ctx, verlet, null, [])

  // The mutable world's traversal graph keys on ONE character's locomotion caps. Use
  // the run target's character (else the first spec) — all runtimes share this one
  // mutable world; per-character traversal is available via traversal(capsOverride).
  const primary =
    (input.run ? specs.find((s) => s.character.id === input.run!.characterId) : undefined) ?? specs[0]
  const mw = createMutableWorld(worldDoc, {
    character: primary?.character,
    events: ctx.events,
    stepMs: STEP_MS,
  })

  if (abortedDuringSetup()) return abortedResult(ctx, verlet, mw, [])

  const runtimes: { id: string; rt: ReturnType<typeof createCharacterRuntime> }[] = []
  for (const spec of specs) {
    const rt = createCharacterRuntime({
      rig: spec.rig,
      character: spec.character,
      world: mw,
      verlet,
      rng: ctx.rng,
      events: ctx.events,
      clips: nullProtoRecord(spec.clips),
      poses: nullProtoRecord(spec.poses),
      names: spec.names,
      restPose: spec.restPose,
      initialTransform: spec.initialTransform,
      secondaryId: spec.secondaryId,
      giveUp: spec.giveUp,
      watchdog: spec.watchdog,
      behaviors,
    })
    // Feet-snap (post-build so the capsule is measurable) — the headless snapFeet.
    if (spec.initialFeetY !== undefined) {
      const c = rt.capsule()
      rt.transform.y += spec.initialFeetY - (c.y1 + c.r)
    }
    runtimes.push({ id: spec.character.id, rt })
    // Per-character stage check: runtime construction (FK solve, secondary chains) is
    // the priciest setup step, so the guard runs between characters.
    if (abortedDuringSetup()) return abortedResult(ctx, verlet, mw, runtimes)
  }

  // Kick off the single driven behavior, if any.
  const runEntry = input.run ? runtimes.find((r) => r.id === input.run!.characterId) : undefined
  if (input.run) {
    if (!runEntry) throw new Error(`simulate: run.characterId '${input.run.characterId}' has no character spec`)
    const bdoc = behaviors[input.run.behaviorId]
    if (!bdoc) throw new Error(`simulate: run.behaviorId '${input.run.behaviorId}' is not in behaviors[]`)
    runEntry.rt.runBehavior(bdoc)
  }

  // ── the loop — clock, every character, the ONE shared verlet, then heal timers ──
  let ticks = 0
  let aborted = false
  while (ticks < maxTicks) {
    ctx.clock.advance()
    for (const { rt } of runtimes) rt.tick()
    verlet.step()
    mw.stepMutations()
    ticks++

    // Terminal: the driven behavior stopped running (arrived/blocked-reaction/failed/
    // force-released all flip running() false). With no run, we advance the full cap.
    if (runEntry && !runEntry.rt.running()) break
    if (opts.shouldAbort && opts.shouldAbort({ tick: ticks, events: ctx.events.trace().length })) {
      aborted = true
      break
    }
  }

  const trace = [...ctx.events.trace()]
  const outcome = deriveOutcome({ aborted, stillRunning: !!runEntry && runEntry.rt.running(), hasRun: !!runEntry, trace })

  const finalState = snapshotState(ctx, verlet, mw, runtimes)
  return { trace, finalState, hash: hashState(finalState), ticks, outcome }
}

// ── helpers ───────────────────────────────────────────────────────────────────────

type RuntimeEntry = { id: string; rt: { getState(): CharacterState } }

function snapshotState(
  ctx: ReturnType<typeof createContext>,
  verlet: ReturnType<typeof createVerletWorld>,
  mw: ReturnType<typeof createMutableWorld> | null,
  runtimes: RuntimeEntry[],
): FinalState {
  return {
    tick: ctx.clock.tick,
    rng: ctx.rng.getState(),
    world: mw ? mw.getState() : { tick: 0, nextId: 1, holes: [] },
    verlet: verlet.getState(),
    characters: runtimes.map(({ id, rt }) => ({ id, state: rt.getState() })),
  }
}

/** A setup-stage abort: outcome 'aborted', tick 0, whatever trace exists so far. */
function abortedResult(
  ctx: ReturnType<typeof createContext>,
  verlet: ReturnType<typeof createVerletWorld>,
  mw: ReturnType<typeof createMutableWorld> | null,
  runtimes: RuntimeEntry[],
): SimulateResult {
  const finalState = snapshotState(ctx, verlet, mw, runtimes)
  return { trace: [...ctx.events.trace()], finalState, hash: hashState(finalState), ticks: 0, outcome: 'aborted' }
}

function deriveOutcome(args: { aborted: boolean; stillRunning: boolean; hasRun: boolean; trace: TraceEvent[] }): Outcome {
  if (args.aborted) return 'aborted'
  if (args.stillRunning) return 'maxticks'
  if (!args.hasRun) return 'idle'
  // The watchdog force-release is the runaway guard — it wins even though the
  // executor's own terminal event fires first inside forceRelease().
  if (args.trace.some((e) => e.type === 'watchdog:forced-release')) return 'watchdog'
  for (let i = args.trace.length - 1; i >= 0; i--) {
    const t = args.trace[i].type
    if (t === 'behavior:halted') return 'halted'
    if (t === 'behavior:ended') return 'ended'
    if (t === 'behavior:complete') return 'complete'
  }
  return 'idle'
}
