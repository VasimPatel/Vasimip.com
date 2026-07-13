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
import { createSquashFlourish } from './controllers/squash'
import { createAccessoryChain, type AccessoryChain } from './accessory'
import { createSecondary, type Secondary } from './secondary'
import type { VerletWorld } from './verlet'
import type { Rng } from './rng'
import type { EventBus } from './events'
import type { MutableWorld } from './world/holes'
import { sweptCapsuleVsSegments, stopAt, type Capsule } from './world/collision'
import { STEP_MS } from './loop'
import {
  createLocomotion,
  type Locomotion,
  type LocomotionState,
  type CharacterTransform,
} from './locomotion'
import { createBehaviorExecutor, type BehaviorExecutor, type BehaviorState, type Speech } from './behavior'
import { createWatchdog, type Watchdog, type WatchdogState } from './watchdog'

export type { CharacterTransform } from './locomotion'

/** Default hip height above the floor at rest (px) if the rig can't be measured. */
const DEFAULT_HIP_HEIGHT = 30
/** Capsule radius as a fraction of the rest-pose half-width. */
const CAP_RADIUS_FRAC = 0.42
const CAP_RADIUS_MIN = 6
const CAP_RADIUS_MAX = 34

// ── root recoil (impulse self → REAL knockback on the transform) ──────────────────
/** Per-tick multiplicative decay of the recoil velocity (≈300ms to rest at 120 Hz). */
const RECOIL_DECAY = 0.88
/** Below this speed (px/s) the recoil snaps to zero (halt-stable, never a slow drift). */
const RECOIL_STOP = 4
/** Collision skin so a recoiling capsule rests just outside a wall (no penetration). */
const RECOIL_SKIN = 0.5
/** Force-release settle probe: how far below the character we search for a support. */
const SETTLE_PROBE_PX = 2000

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
  /** Resolve an impulse target (entity id) to a verlet body id. A bare `'self'` maps
   * to this character's own secondary body by default (so `impulse self backward`
   * works out of the box); an explicit resolver overrides. */
  resolveVerletBody?: (entityRef: string) => string | undefined
  /** Conventional pose/clip names for the default give-up (shrug-and-sit). */
  giveUp?: { shrug?: string; sit?: string }
  /** Watchdog tuning. The runtime OWNS and TICKS its watchdog (production behaviors
   * can never wedge without any external ticking); `maxBehaviorMs` overrides the
   * executor's computed per-run budget (mainly for tests / hard site caps). */
  watchdog?: { maxBehaviorMs?: number }
  /** Build accessory ribbons from CharacterDoc.accessoryPoints (default true). */
  accessories?: boolean
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
  /** In-flight root recoil velocity (px/s, horizontal — see applyRootImpulse). */
  recoilVx: number
  /** The runtime-owned watchdog's window (latch + elapsed), so restore keeps it coherent. */
  watchdog: WatchdogState
  /** Squash/stretch flourish spring (charm) — optional for pre-charm snapshots.
   * `hold` is the windup's held crouch target (parity pass) — a serializer that
   * drops it would restore a mid-anticipation snapshot un-crouched. */
  squash?: { sx: number; sy: number; vx: number; vy: number; hold?: { sx: number; sy: number } | null }
}

export interface CharacterRuntime {
  tick(): void
  /** Run a behavior. `opts.travel` binds the from/to panels the doc's travel:*
   * refs resolve against — applied AFTER the run's locomotion reset, so the
   * binding is atomic with the run (a reset clears any previous binding). */
  runBehavior(doc: BehaviorDoc, opts?: { travel?: { from?: string; to?: string } }): void
  getState(): CharacterState
  setState(s: CharacterState): void
  readonly transform: CharacterTransform
  /** Last solved skeleton (post-additive, world-space) — for the renderer/tests. */
  solved(): SolvedSkeleton
  /** This tick's face aux channel. */
  face(): FaceAux
  /** The blender's current source (pose id during a strikePose hold) — the site
   * uses it to attach pose PROPS (sword, spray can) and pose-scoped acting. */
  activeSource(): { kind: 'pose' | 'clip'; id: string }
  /** Current world collision capsule. */
  capsule(): Capsule
  /** Verlet endpoint overrides for the renderer (secondary follow-through). */
  overrides(): Record<string, { ex: number; ey: number }>
  /** A behavior is in progress. 7b's watchdog force-release wraps this. */
  running(): boolean
  /** The current speech bubble (or null) — the renderer draws it (7b). */
  speech(): Speech | null
  /** This tick's squash/stretch scales (charm) — renderer group transform. */
  flourish(): { sx: number; sy: number }
  /** Bind/unbind the from/to panels travel:* refs resolve against (P9 travel runs). */
  setTravelContext(ctx: { from?: string; to?: string } | null): void
  /** Accessory ribbons (charm; e.g. the bandana) — renderer draws points(). */
  readonly accessories: readonly AccessoryChain[]
  /** Monotonic per-run id (the watchdog's per-run latch key). */
  runId(): number
  /** Current run's total time bound (ms) — the watchdog's default budget. */
  budgetMs(): number
  /** Force the behavior to safe idle NOW (the watchdog's force-release). Also settles
   * the transform onto the nearest support below (a mid-air release never leaves the
   * character floating). The runtime OWNS a watchdog that calls this automatically. */
  forceRelease(): void
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
    events, // expression controller: brows/mouth act out this character's events
  })

  // Squash & stretch flourish (charm) — kicked by this character's own motion
  // events, read by the renderer as a group transform. Pure + tick-driven.
  // Unsubscribers retained for dispose() (review finding: no listener leaks).
  const flourish = createSquashFlourish()
  const flourishOffs = [
    events.on('jump:windup', () => flourish.trigger('windup')), // anticipation crouch, held
    events.on('jump:launch', () => flourish.trigger('launch')), // kick clears the hold
    events.on('jump:land', () => flourish.trigger('land')),
    events.on('intent:blocked', () => flourish.trigger('poke')),
    events.on('expression:poke', () => flourish.trigger('poke')),
    // An interrupted/failed run must never leave the crouch held.
    events.on('behavior:interrupted', () => flourish.releaseHold()),
    events.on('intent:failed', () => flourish.releaseHold()),
  ]
  let lastFlourish = { sx: 1, sy: 1 }

  // Accessory chains (charm) — one verlet ribbon per CharacterDoc.accessoryPoints
  // entry that names a rig joint (Dash: the neck bandana). Same shared solver.
  // OPT-IN (accessories: true): they are presentation, and headless tests often
  // stub the verlet world with less than addBody/setPinTarget.
  const accessories: AccessoryChain[] = []
  if (opts.accessories === true) {
    for (const anchor of character.accessoryPoints ?? []) {
      if (rig.joints.some((j) => j.id === anchor)) {
        accessories.push(createAccessoryChain(verlet, rig, character.id, { anchorJoint: anchor }))
      }
    }
  }
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

  const secondaryBodyId = opts.secondaryId ?? `secondary:${character.id}`
  const resolveVerletBody =
    opts.resolveVerletBody ?? ((ref: string) => (ref === 'self' ? secondaryBodyId : undefined))

  // ── root recoil (impulse self) ────────────────────────────────────────────────
  // A REAL knockback on the character transform: a decaying horizontal velocity,
  // integrated each tick with a swept-capsule collision check (a recoil can never
  // tunnel through the wall behind). POLICY (documented): only the HORIZONTAL
  // component displaces the root — a decay-only vertical would leave the character
  // hovering (no gravity outside jump ballistics); the vertical component still
  // reads visually through the verlet secondary follow-through.
  let recoilVx = 0
  function applyRootImpulse(vx: number, _vy: number): void {
    recoilVx += vx
  }

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
    characterReactions: character.reactions,
    giveUp: opts.giveUp,
    resolveVerletBody,
    applyRootImpulse,
    behaviors: opts.behaviors,
  })

  // ── watchdog (OWNED + TICKED here — production behaviors can never wedge) ────────
  // Force-release must leave the character in a PHYSICALLY safe pose, not just a
  // logically idle one: a release mid-jump would otherwise strand the transform in
  // the air forever (nothing outside jump ballistics applies gravity). So after the
  // executor releases, settle: probe straight down and snap onto the first support.
  function settleToSupport(): void {
    const hit = sweptCapsuleVsSegments(capsule(), 0, SETTLE_PROBE_PX, world.collision().segments)
    if (hit) {
      const p = stopAt(transform.x, transform.y, transform.x, transform.y + SETTLE_PROBE_PX, hit.t, RECOIL_SKIN)
      transform.y = p.y
    }
    // No support below (a fully cut-away world): leave the transform — the release
    // is still logically complete and the position bounded (documented limitation).
  }

  function forceRelease(): void {
    behavior.forceRelease()
    flourish.releaseHold() // a release mid-anticipation must drop the held crouch
    recoilVx = 0
    settleToSupport()
  }

  const watchdog: Watchdog = createWatchdog(
    {
      running: () => behavior.running(),
      runId: () => behavior.runId(),
      budgetMs: () => behavior.budgetMs(),
      forceRelease,
    },
    { maxBehaviorMs: opts.watchdog?.maxBehaviorMs, events, characterId: character.id },
  )

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
    // 3. face contributors (blink + look-at pupils) — the active POSE may override
    // brow/mouth (the legacy per-pose expressions: Fight's steep brows + grit).
    lastFace = controllerSet.update(tickCount)
    const src = blender.currentSource()
    const poseFace = src.kind === 'pose' ? (poses[src.id] as { face?: { brow?: FaceAux['brow']; mouth?: FaceAux['mouth']; intensity?: number } } | undefined)?.face : undefined
    if (poseFace) {
      if (poseFace.brow) lastFace = { ...lastFace, brow: poseFace.brow }
      if (poseFace.mouth) lastFace = { ...lastFace, mouth: poseFace.mouth }
      if (poseFace.intensity !== undefined) lastFace = { ...lastFace, intensity: poseFace.intensity }
    }
    // 4. base blend + additives; clip markers drive the jump launch sync.
    const { pose, markers } = blender.tick()
    // 5. jump launch (marker-synced) + ballistic integration + landing.
    locomotion.postBlend(markers)
    // 5b. root recoil (impulse self): decaying horizontal knockback, swept vs walls.
    if (recoilVx !== 0) {
      const dx = recoilVx * (STEP_MS / 1000)
      const hit = sweptCapsuleVsSegments(capsule(), dx, 0, world.collision().segments)
      if (hit) {
        const p = stopAt(transform.x, transform.y, transform.x + dx, transform.y, hit.t, RECOIL_SKIN)
        transform.x = p.x
        recoilVx = 0 // absorbed by the wall — no bounce (inelastic, like the props)
      } else {
        transform.x += dx
        recoilVx *= RECOIL_DECAY
        if (Math.abs(recoilVx) < RECOIL_STOP) recoilVx = 0
      }
    }
    // 6. POST-ADDITIVE FK at the world transform (breathing bob = blender root Y).
    lastSolved = solveFk(
      rig,
      { id: '__pose', angles: pose.angles },
      {
        proportions: character.proportions,
        rootTransform: { x: transform.x, y: transform.y + (pose.root.y - baselineRootY), rot: transform.rot },
      },
    )
    // 7. frame for NEXT tick's look-at; heading for the 3/4-view eyes.
    controllerSet.feedSolved(lastSolved)
    controllerSet.setFacing(transform.facing)
    // 8. secondary follow-through TARGETS (caller steps the shared verlet once);
    //    accessory ribbons re-pin to their anchors in the same pass.
    secondary.step(lastSolved)
    for (const acc of accessories) acc.step(lastSolved, tickCount, transform.facing)
    // 8b. squash/stretch spring toward rest.
    lastFlourish = flourish.tick()
    // 9. watchdog — ticked HERE, unconditionally: no caller wiring can forget it.
    watchdog.tick()
  }

  function runBehavior(doc: BehaviorDoc, opts?: { travel?: { from?: string; to?: string } }): void {
    behavior.run(doc) // resets locomotion (incl. any stale travel binding)
    locomotion.setTravelContext(opts?.travel ?? null)
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
        recoilVx,
        watchdog: watchdog.getState(),
        squash: flourish.getState(),
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
      recoilVx = s.recoilVx
      watchdog.setState(s.watchdog)
      // Absent squash state (pre-charm snapshot) resets to rest — a stale spring
      // must not survive a restore. The renderer-facing cache updates immediately
      // so a render before the next tick shows the restored value, not the old one.
      const sq = s.squash ?? { sx: 1, sy: 1, vx: 0, vy: 0 }
      flourish.setState(sq)
      lastFlourish = { sx: sq.sx, sy: sq.sy }
      // Additives are behavior, re-registered by construction (the set stays live).
    },
    get transform() {
      return transform
    },
    solved: () => lastSolved,
    face: () => lastFace,
    activeSource: () => blender.currentSource(),
    capsule,
    overrides: () => secondary.overrides(),
    running: () => behavior.running(),
    speech: () => behavior.speech(),
    flourish: () => lastFlourish,
    setTravelContext: (ctx) => locomotion.setTravelContext(ctx),
    accessories,
    runId: () => behavior.runId(),
    budgetMs: () => behavior.budgetMs(),
    forceRelease,
    locomotion,
    behavior,
    dispose(): void {
      controllerSet.dispose()
      behavior.dispose()
      for (const off of flourishOffs) off()
      for (const acc of accessories) acc.dispose()
    },
  }
}
