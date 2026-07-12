// Accessory chain (charm checkpoint) — a small verlet ribbon (Dash's bandana; any
// CharacterDoc.accessoryPoints entry) that trails an anchor joint. The chain lives
// in the SAME shared verlet world as everything else (one solver per world); its
// root particle is PINNED to the anchor joint's world position each tick — anchor
// targeting, the same energy class as the secondary chains' spring targets (the
// character's own motion is what animates it; there is no independent force inlet).
//
// A tiny tick-phase sway is folded into the pin target so the ribbon flutters at
// idle the way the legacy cape's CSS animation did — deterministic (tick sine), a
// few px, and applied to the PIN (constraint target), not as an impulse.
//
// The renderer draws the sampled points as a tapered ribbon; this module owns only
// the physics.

import type { RigTemplate } from '@dash/schema'
import type { SolvedSkeleton } from './fk'
import type { VerletWorld } from './verlet'

export interface AccessoryChainOptions {
  /** Joint whose ORIGIN anchors the chain ('neck' → head bone origin on Dash). */
  anchorJoint: string
  /** Chain segment count (default 3) and length per segment (default 8 px). */
  segments?: number
  segmentLen?: number
  /** Fabric feel: damping (default 0.90) and gravity scale (default 0.5). */
  damping?: number
  gravityScale?: number
  /** Idle flutter amplitude in px (default 1.6) and period in ticks (default 150). */
  flutterAmp?: number
  flutterPeriod?: number
  /** Anchor offset from the joint, in px, flipped by facing (default −4, −2: behind
   * the neck, slightly up — where the legacy cape knots). */
  offsetX?: number
  offsetY?: number
}

export interface AccessoryChain {
  /** Re-pin the root to the anchor joint and advance the flutter phase. Call once
   * per tick BETWEEN feedSolved and the world step. `facing` flips the offset. */
  step(solved: SolvedSkeleton, tick: number, facing: 1 | -1): void
  /** Sampled world-space chain points, root→tip (reused array — copy to keep). */
  points(): ReadonlyArray<{ x: number; y: number }>
  readonly bodyId: string
  dispose(): void
}

export function createAccessoryChain(
  world: VerletWorld,
  rig: RigTemplate,
  characterId: string,
  opts: AccessoryChainOptions,
): AccessoryChain {
  // Defaults tuned against the legacy cape: it FLIES (a flag), it doesn't hang
  // (a rope) — so gravity is nearly off and the flutter does the lifting. The
  // trailing stream direction comes from the pin leading the chain as the
  // character moves and from the flutter's slight upward bias at idle.
  const segments = opts.segments ?? 3
  const segLen = opts.segmentLen ?? 11
  const damping = opts.damping ?? 0.94
  const gravityScale = opts.gravityScale ?? 0.12
  const flutterAmp = opts.flutterAmp ?? 3.2
  const flutterPeriod = opts.flutterPeriod ?? 120
  const offsetX = opts.offsetX ?? -6
  const offsetY = opts.offsetY ?? -3

  if (!rig.joints.some((j) => j.id === opts.anchorJoint)) {
    throw new Error(`accessory: rig has no joint ${JSON.stringify(opts.anchorJoint)}`)
  }

  const bodyId = `accessory:${characterId}:${opts.anchorJoint}`
  const REST_STIFF = 0.016

  // LAZY body creation on the first step(): particles are born already in the rest
  // shape around the REAL anchor position, so there is never a first-frame
  // page-spanning ribbon while the chain snaps from the world origin to the neck
  // (independent-review finding).
  let handle: import('./verlet').BodyHandle | null = null
  let rootPid = 0
  let springIds: number[] = []

  function buildAt(ax: number, ay: number, facing: 1 | -1): void {
    const particles = []
    const constraints = []
    for (let i = 0; i <= segments; i++) {
      particles.push({ x: ax - facing * i * segLen * 0.9, y: ay + i * segLen * 0.3, pinned: i === 0 })
    }
    for (let i = 0; i < segments; i++) {
      constraints.push({ kind: 'distance' as const, a: i, b: i + 1, rest: segLen, stiffness: 1 })
    }
    // The flag's AUTHORED REST SHAPE (the disturbable-prop pattern: rest = art,
    // verlet = life): each free particle carries a soft spring toward a point
    // streaming BEHIND the character, so the bandana flies like the legacy cape
    // instead of hanging like a rope — and every disturbance still flows and homes.
    for (let i = 1; i <= segments; i++) {
      constraints.push({
        kind: 'spring' as const,
        a: i,
        ax: ax - facing * i * segLen * 0.9,
        ay: ay + i * segLen * 0.3,
        stiffness: REST_STIFF,
      })
    }
    handle = world.addBody(bodyId, particles, constraints, 'free', { damping, gravityScale })
    rootPid = handle.particleIds[0]
    // Spring constraint ids for the free particles, in chain order (re-anchored
    // to follow the character each tick).
    springIds = handle.constraintIds.slice(segments)
  }

  const buf: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= segments; i++) buf.push({ x: 0, y: 0 })
  const EMPTY_POINTS: ReadonlyArray<{ x: number; y: number }> = []

  return {
    step(solved, tick, facing) {
      const bone = solved.bones.find((b) => b.id === opts.anchorJoint)
      if (!bone) return
      // Two incommensurate sines (like the weight-shift controller) so the flutter
      // never reads metronomic; a slight upward bias keeps the flag streaming.
      const p = (tick * 2 * Math.PI) / flutterPeriod
      const sway = flutterAmp * (Math.sin(p) + 0.5 * Math.sin(p * 1.618))
      const ax = bone.ox + facing * offsetX
      const ay = bone.oy + offsetY
      if (!handle) buildAt(ax, ay, facing)
      world.setPinTarget(rootPid, ax + sway * 0.5, ay - Math.abs(sway) * 0.35)
      // Stream the rest shape behind the heading; the flutter waves the tip.
      for (let i = 0; i < springIds.length; i++) {
        const k = i + 1
        const wave = sway * (0.35 + 0.5 * (k / segments))
        world.setSpringAnchor(
          springIds[i],
          ax - facing * k * segLen * 0.9,
          ay + k * segLen * 0.3 + wave,
        )
      }
    },
    points() {
      if (!handle) return EMPTY_POINTS
      for (let i = 0; i < buf.length; i++) {
        buf[i].x = world.particleX(handle.particleIds[i])
        buf[i].y = world.particleY(handle.particleIds[i])
      }
      return buf
    },
    bodyId,
    dispose() {
      // Bodies are cheap and worlds are per-scene; explicit removal lands with P9's
      // entity lifecycle if needed. Unpin so a leaked chain just falls asleep.
      if (handle) world.unpin(rootPid)
    },
  }
}
