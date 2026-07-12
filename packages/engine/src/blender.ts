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

/** Fully serializable blender state (plain JSON). Additive FNS are NOT part of it
 * — they are behavior, re-registered by the caller after setState. */
export interface BlenderState {
  joints: Record<string, JointState>
  root: RootState
  smoothTime: number
  decayTau: number
  tick: number
  source: Source
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
  /** Advance one fixed tick; returns the POST-ADDITIVE pose + markers crossed. */
  tick(): BlenderTick
  /** Cheap identity of the CURRENT base source ({kind, id}) — lets a caller waiting
   * on a clip's markers (the P7 launch-marker binding) detect a mid-wait source
   * replacement without the cost of getState(). */
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
  let smoothTime = trackSmoothTime
  let decayTau = trackSmoothTime
  let tickCount = 0

  const additives = new Map<string, AdditiveFn>()

  function currentTargetRoot(sample: ClipSample): { x: number; y: number; rot: number } {
    // A source without a root track FREEZES the root (target = current) rather than
    // yanking it to the origin.
    return sample.root ?? { x: root.x, y: root.y, rot: root.rot }
  }

  return {
    setSource(src, o) {
      const durationSec = (o?.durationMs ?? DEFAULT_TRANSITION_MS) / 1000
      smoothTime = Math.max(durationSec * SMOOTH_TIME_FACTOR, trackSmoothTime)
      decayTau = Math.max(durationSec, DT)
      // Velocity + angle are deliberately untouched — the no-pop mechanism.
      source = isClip(src) ? { kind: 'clip', clip: src, timeMs: 0 } : { kind: 'pose', pose: src }
    },

    tick(): BlenderTick {
      tickCount++

      // ── sample the target source ────────────────────────────────────────────
      let sample: ClipSample
      let markers: string[] = []
      if (source.kind === 'clip') {
        const prev = source.timeMs
        const next = prev + STEP_MS
        source.timeMs = next
        sample = sampleClip(source.clip, next)
        markers = markersCrossed(source.clip, prev, next)
      } else {
        sample = { angles: source.pose.angles, root: source.pose.root }
      }
      const tRoot = currentTargetRoot(sample)

      // ── 1. base blend (persistent velocity, never reset) ────────────────────
      for (const id of jointIds) {
        const js = joints.get(id)!
        const target = sample.angles[id]
        const tgt = target === undefined ? js.angle : target
        const r = smoothDampAngle(js.angle, tgt, js.vel, smoothTime, DT)
        js.angle = r.value
        js.vel = r.velocity
      }
      {
        const rx = smoothDamp(root.x, tRoot.x, root.vx, smoothTime, DT)
        root.x = rx.value
        root.vx = rx.velocity
        const ry = smoothDamp(root.y, tRoot.y, root.vy, smoothTime, DT)
        root.y = ry.value
        root.vy = ry.velocity
        const rr = smoothDampAngle(root.rot, tRoot.rot, root.vrot, smoothTime, DT)
        root.rot = rr.value
        root.vrot = rr.velocity
      }

      // decay smoothTime toward the steady tracking constant (velocity-safe).
      smoothTime = trackSmoothTime + (smoothTime - trackSmoothTime) * Math.exp(-DT / decayTau)

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
      const src: Source =
        source.kind === 'clip'
          ? { kind: 'clip', clip: structuredClone(source.clip), timeMs: source.timeMs }
          : { kind: 'pose', pose: structuredClone(source.pose) }
      return { joints: j, root: { ...root }, smoothTime, decayTau, tick: tickCount, source: src }
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
      source =
        state.source.kind === 'clip'
          ? { kind: 'clip', clip: structuredClone(state.source.clip), timeMs: state.source.timeMs }
          : { kind: 'pose', pose: structuredClone(state.source.pose) }
      // Additives are behavior, not state — the caller re-registers them.
    },
  }
}
