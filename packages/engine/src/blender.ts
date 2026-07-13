// Blend layer (L1b) — the NORMATIVE composition order from ENGINE_V2 Phase 3 and
// the Spike B findings. Per fixed 120 Hz tick, in exactly this order:
//
//   1. BASE BLEND   — per joint, chase a TARGET SOURCE (a static Pose or a playing
//      Clip sampled at the tick's playhead) with an angle-aware critically-damped
//      SmoothDamp carrying a persistent per-joint velocity that is NEVER reset. A
//      "crossfade" is nothing but a change of target (setSource): the interrupt
//      continues from the current angle AND velocity, which is the no-pop mechanism
//      (Spike B: interrupt pop 1.04× a normal transition vs 13.85× for eased lerp).
//      Root offset uses the linear SmoothDamp variant (rot is angle-aware).
//   2. ADDITIVE     — registered additive fns write joint-angle deltas / a root-Y
//      bob into a THROWAWAY per-tick buffer, NEVER back into blend state (feeding
//      the integrator drifts it). Angular deltas pre-FK; root-Y after base root.
//   3. (caller) FK solves the POST-ADDITIVE pose; render interpolation is last.
//
// TRANSITION POLICY (no weight-crossfading — a single SmoothDamp integrator does it
// all): setSource(src, { durationMs }) sets a per-transition smoothTime ≈
// durationSec × 0.6 (Spike B) and then DECAYS that smoothTime, tick by tick, toward
// a small steady TRACK smoothTime with a time constant of ~durationSec. Because
// SmoothDamp threads velocity across ticks regardless of smoothTime, changing
// smoothTime every tick is velocity-continuous BY CONSTRUCTION — so the decay costs
// nothing in continuity while making a converged blender near-passthrough on a
// moving clip (it stops lagging a steady walk). Mid-transition retargets and
// pose→clip→pose chains just re-arm smoothTime with velocity intact.

import type { Clip, Pose, RigTemplate, RootOffset } from '@dash/schema'
import { STEP_MS } from './loop'
import { smoothDamp, smoothDampAngle, wrapPi } from './math'
import { sampleClip, markersCrossed, type ClipSample } from './clip'

const DT = STEP_MS / 1000
const SMOOTH_TIME_FACTOR = 0.6
const DEFAULT_TRANSITION_MS = 300
/** Steady-state smoothTime once converged — small enough to track a moving clip
 * near-passthrough (≈50 ms lag on a ~800 ms cycle), large enough to never re-pop. */
const DEFAULT_TRACK_SMOOTH_TIME = 0.05

/** A registered additive contributor. Reads the blender's internal tick, returns
 * joint-angle deltas (radians) and/or a root-Y bob (px). Pre-FK for angles. */
export type AdditiveFn = (tick: number) => { angles?: Record<string, number>; rootY?: number }

interface JointState {
  angle: number
  vel: number
}
interface RootState {
  x: number
  vx: number
  y: number
  vy: number
  rot: number
  vrot: number
}

type Source =
  | { kind: 'pose'; pose: Pose }
  | { kind: 'clip'; clip: Clip; timeMs: number }

/** The concurrent ACTING layer (parity recovery, Stage 2a). A full-skeleton
 * override that the base blend chases INSTEAD of the base source while active —
 * the base source keeps advancing underneath (a walk cycle stays in phase), so
 * entering and leaving acting are ordinary target changes on the same persistent
 * velocity integrator: velocity-continuous both ways, by construction. This is
 * what makes cue strikePose/playClip VISIBLE (vault poses mid-jump, rope poses
 * mid-walk) and what carries persist-until-next-transition arrival poses. */
interface ActingState {
  source: Source
  /** ms to hold before auto-release, or 'persist' (until clearActing). */
  hold: number | 'persist'
  elapsedMs: number
  /** Transition duration for the release back to the base source. */
  returnMs: number
  /** The acting layer's OWN transition envelope. The base layer's setSource
   * (locomotion retargets every state change) must not stomp an in-flight
   * acting blend — review finding: shared smoothTime made cue blendMs a lie. */
  smoothTime: number
  decayTau: number
}

/** Fully serializable blender state (plain JSON). Additive FNS are NOT part of it
 * — they are behavior, re-registered by the caller after setState. */
export interface BlenderState {
  joints: Record<string, JointState>
  root: RootState
  smoothTime: number
  decayTau: number
  tick: number
  source: Source
  /** Optional for pre-parity snapshots (older goldens restore acting-free). */
  acting?: ActingState | null
}

export interface BlenderTick {
  pose: { angles: Record<string, number>; root: RootOffset }
  /** Marker events crossed on THIS tick while a clip source plays (empty otherwise).
   * The caller emits them on the engine bus stamped with the sim tick. */
  markers: string[]
}

export interface Blender {
  /** Retarget the base blend to a Pose or a Clip; velocity carries (no pop). */
  setSource(source: Pose | Clip, opts?: { durationMs?: number }): void
  /** Override the visible target with an ACTING source (concurrent performance
   * layer). The base source keeps time underneath; holdMs auto-releases, 'persist'
   * stays until clearActing(). Velocity-continuous in and out. */
  setActing(source: Pose | Clip, opts?: { durationMs?: number; holdMs?: number | 'persist'; returnMs?: number }): void
  /** Release the acting override (no-op when none). The return to the base source
   * is a normal transition (durationMs, default the acting's returnMs). */
  clearActing(opts?: { durationMs?: number }): void
  /** Identity of the acting source, or null when the base is in control. */
  actingSource(): { kind: 'pose' | 'clip'; id: string } | null
  /** Advance one fixed tick; returns the POST-ADDITIVE pose + markers crossed. */
  tick(): BlenderTick
  /** Cheap identity of the CURRENT base source ({kind, id}) — lets a caller waiting
   * on a clip's markers (the P7 launch-marker binding) detect a mid-wait source
   * replacement without the cost of getState(). NOT affected by acting (the P7
   * binding watches the base); use actingSource() for the visible identity. */
  currentSource(): { kind: 'pose' | 'clip'; id: string }
  addAdditive(id: string, fn: AdditiveFn): void
  removeAdditive(id: string): void
  getState(): BlenderState
  setState(state: BlenderState): void
}

export interface BlenderOptions {
  /** Seed the base pose (angles + root) so the first ticks don't swing from zero. */
  initialPose?: Pose
  /** Steady-state tracking smoothTime in seconds (default 0.05). */
  trackSmoothTime?: number
}

function isClip(src: Pose | Clip): src is Clip {
  return Array.isArray((src as Clip).tracks)
}

export function createBlender(rig: RigTemplate, opts?: BlenderOptions): Blender {
  const jointIds = rig.joints.map((j) => j.id)
  const trackSmoothTime = opts?.trackSmoothTime ?? DEFAULT_TRACK_SMOOTH_TIME

  const joints = new Map<string, JointState>()
  const initAngles = opts?.initialPose?.angles ?? {}
  for (const id of jointIds) joints.set(id, { angle: initAngles[id] ?? 0, vel: 0 })

  const ir = opts?.initialPose?.root
  const root: RootState = { x: ir?.x ?? 0, vx: 0, y: ir?.y ?? 0, vy: 0, rot: ir?.rot ?? 0, vrot: 0 }

  const restPose: Pose = opts?.initialPose ?? { id: '__rest', angles: {} }
  let source: Source = { kind: 'pose', pose: restPose }
  let acting: ActingState | null = null
  let smoothTime = trackSmoothTime
  let decayTau = trackSmoothTime
  let tickCount = 0

  const DEFAULT_ACTING_RETURN_MS = 250

  function armTransition(durationMs: number): void {
    const durationSec = durationMs / 1000
    smoothTime = Math.max(durationSec * SMOOTH_TIME_FACTOR, trackSmoothTime)
    decayTau = Math.max(durationSec, DT)
  }

  function releaseActing(durationMs: number): void {
    if (!acting) return
    acting = null
    armTransition(durationMs) // the return to base is a normal transition (no pop)
  }

  const additives = new Map<string, AdditiveFn>()

  function currentTargetRoot(sample: ClipSample): { x: number; y: number; rot: number } {
    // A source without a root track FREEZES the root (target = current) rather than
    // yanking it to the origin.
    return sample.root ?? { x: root.x, y: root.y, rot: root.rot }
  }

  function advanceSource(src: Source, markers: string[]): ClipSample {
    if (src.kind === 'clip') {
      const prev = src.timeMs
      const next = prev + STEP_MS
      src.timeMs = next
      markers.push(...markersCrossed(src.clip, prev, next))
      return sampleClip(src.clip, next)
    }
    return { angles: src.pose.angles, root: src.pose.root }
  }

  return {
    setSource(src, o) {
      armTransition(o?.durationMs ?? DEFAULT_TRANSITION_MS)
      // Velocity + angle are deliberately untouched — the no-pop mechanism.
      source = isClip(src) ? { kind: 'clip', clip: src, timeMs: 0 } : { kind: 'pose', pose: src }
    },

    setActing(src, o) {
      const durationSec = (o?.durationMs ?? 160) / 1000
      acting = {
        source: isClip(src) ? { kind: 'clip', clip: src, timeMs: 0 } : { kind: 'pose', pose: src },
        hold: o?.holdMs ?? 'persist',
        elapsedMs: 0,
        returnMs: o?.returnMs ?? DEFAULT_ACTING_RETURN_MS,
        smoothTime: Math.max(durationSec * SMOOTH_TIME_FACTOR, trackSmoothTime),
        decayTau: Math.max(durationSec, DT),
      }
    },

    clearActing(o) {
      releaseActing(o?.durationMs ?? acting?.returnMs ?? DEFAULT_ACTING_RETURN_MS)
    },

    actingSource() {
      if (!acting) return null
      return acting.source.kind === 'clip'
        ? { kind: 'clip' as const, id: acting.source.clip.id }
        : { kind: 'pose' as const, id: acting.source.pose.id }
    },

    tick(): BlenderTick {
      tickCount++

      // ── sample the target source(s) ─────────────────────────────────────────
      // The BASE always advances (a walk cycle keeps phase under an acting hold).
      // ONLY base markers surface: the launch-marker binding must never be
      // satisfied by a decorative acting clip's marker (review finding), and an
      // acting layer's own markers have no consumer by design.
      const markers: string[] = []
      const baseSample = advanceSource(source, markers)
      let sample = baseSample
      let activeSmooth = smoothTime
      if (acting) {
        // Expiry check BEFORE sampling (review finding: post-increment released one
        // tick early and advanced/marked the acting clip on its expired tick).
        if (acting.hold !== 'persist' && acting.elapsedMs >= acting.hold) {
          releaseActing(acting.returnMs) // base regains the target this tick
        } else {
          const throwaway: string[] = []
          sample = advanceSource(acting.source, throwaway)
          acting.elapsedMs += STEP_MS
          // acting's own envelope (decayed below); base smoothTime keeps its life
          activeSmooth = acting.smoothTime
        }
      }
      const tRoot = currentTargetRoot(sample)

      // ── 1. base blend (persistent velocity, never reset) ────────────────────
      // activeSmooth = the OWNING layer's envelope: acting's while it holds the
      // target, the base's otherwise — one integrator, two transition lives.
      for (const id of jointIds) {
        const js = joints.get(id)!
        const target = sample.angles[id]
        const tgt = target === undefined ? js.angle : target
        const r = smoothDampAngle(js.angle, tgt, js.vel, activeSmooth, DT)
        js.angle = r.value
        js.vel = r.velocity
      }
      {
        const rx = smoothDamp(root.x, tRoot.x, root.vx, activeSmooth, DT)
        root.x = rx.value
        root.vx = rx.velocity
        const ry = smoothDamp(root.y, tRoot.y, root.vy, activeSmooth, DT)
        root.y = ry.value
        root.vy = ry.velocity
        const rr = smoothDampAngle(root.rot, tRoot.rot, root.vrot, activeSmooth, DT)
        root.rot = rr.value
        root.vrot = rr.velocity
      }

      // decay BOTH envelopes toward the steady tracking constant (velocity-safe).
      smoothTime = trackSmoothTime + (smoothTime - trackSmoothTime) * Math.exp(-DT / decayTau)
      if (acting) acting.smoothTime = trackSmoothTime + (acting.smoothTime - trackSmoothTime) * Math.exp(-DT / acting.decayTau)

      // ── 2. additive (throwaway buffer, never written back) ──────────────────
      const angles: Record<string, number> = {}
      for (const id of jointIds) angles[id] = joints.get(id)!.angle
      const outRoot: RootOffset = { x: root.x, y: root.y, rot: root.rot }

      if (additives.size > 0) {
        for (const fn of additives.values()) {
          const res = fn(tickCount)
          if (res.angles) {
            for (const [id, delta] of Object.entries(res.angles)) {
              if (id in angles) angles[id] = wrapPi(angles[id] + delta)
            }
          }
          if (res.rootY !== undefined) outRoot.y += res.rootY
        }
      }

      return { pose: { angles, root: outRoot }, markers }
    },

    currentSource() {
      return source.kind === 'clip'
        ? { kind: 'clip' as const, id: source.clip.id }
        : { kind: 'pose' as const, id: source.pose.id }
    },

    addAdditive(id, fn) {
      additives.set(id, fn)
    },
    removeAdditive(id) {
      additives.delete(id)
    },

    // Snapshots DEEP-COPY the source doc (structuredClone): a snapshot must be
    // immutable plain JSON, never an alias into a live clip/pose object that a
    // caller might mutate between snapshot and restore.
    getState(): BlenderState {
      const j: Record<string, JointState> = {}
      for (const [id, s] of joints) j[id] = { angle: s.angle, vel: s.vel }
      const cloneSrc = (s: Source): Source =>
        s.kind === 'clip'
          ? { kind: 'clip', clip: structuredClone(s.clip), timeMs: s.timeMs }
          : { kind: 'pose', pose: structuredClone(s.pose) }
      const state: BlenderState = {
        joints: j, root: { ...root }, smoothTime, decayTau, tick: tickCount, source: cloneSrc(source),
      }
      // Key OMITTED when inactive (not `acting: null`) so pre-parity golden state
      // hashes are byte-identical for acting-free runs.
      if (acting) state.acting = { ...acting, source: cloneSrc(acting.source) }
      return state
    },

    setState(state) {
      for (const id of jointIds) {
        const s = state.joints[id]
        joints.set(id, s ? { angle: s.angle, vel: s.vel } : { angle: 0, vel: 0 })
      }
      root.x = state.root.x
      root.vx = state.root.vx
      root.y = state.root.y
      root.vy = state.root.vy
      root.rot = state.root.rot
      root.vrot = state.root.vrot
      smoothTime = state.smoothTime
      decayTau = state.decayTau
      tickCount = state.tick
      const cloneSrc = (s: Source): Source =>
        s.kind === 'clip'
          ? { kind: 'clip', clip: structuredClone(s.clip), timeMs: s.timeMs }
          : { kind: 'pose', pose: structuredClone(s.pose) }
      source = cloneSrc(state.source)
      acting = state.acting ? { ...state.acting, source: cloneSrc(state.acting.source) } : null
      // Additives are behavior, not state — the caller re-registers them.
    },
  }
}
