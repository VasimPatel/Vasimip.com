// Character secondary (L3) — verlet follow-through for the rig's secondarySlots
// (foreArmL, foreArmR, head). Registers ONE body per character in the SHARED verlet
// world (secondary.ts never makes its own solver — ENGINE_V2 §2/§3: one instance per
// world). Per slot, a single free "end" particle is:
//   • SPRING-pulled toward the post-additive FK end each tick (the lag), and
//   • HARD length-locked to a pinned "anchor" particle sitting on the FK origin,
// so positional lag becomes ANGULAR follow-through, never stretch (Spike B).
//
// WHY POST-ADDITIVE: the spring target is the FK END of the post-L2 (breathing/look-
// at) pose, fed via step(solved). Targeting the pre-additive pose strips the breathing
// from the follow-through and reads dead (Spike B). The caller passes the SAME solved
// skeleton it feeds the renderer.
//
// COEXISTENCE WITH THE WORLD'S 4 ITERATIONS (the one-solver story): secondary
// constraints live in the shared solver and the world runs its usual `iterations`
// (4) relaxation passes. Each constraint carries its own `iters`: the soft spring
// runs on the FIRST 2 passes (Spike B's "2 iterations", stiffness 0.28), the hard
// length-lock runs on all 4. Because the length-lock is the ONLY constraint active on
// the final pass, |end − anchor| is restored to the bone length exactly at the end of
// every tick → the no-stretch guarantee. No second solver, no second solve pass.
//
// PER-TICK ORDER (documented normative wiring — see controllers/set.ts):
//   set.update(tick) → blender.tick() → solveFk() → set.feedSolved(solved)
//   → secondary.step(solved)   // updates pin/spring TARGETS only (kinematic follow)
//   → world.step()             // the ONE shared solve, for secondary+props+ropes
//   → renderer.render(solved, face, secondary.overrides())
// secondary.step deliberately does NOT step the world: the world is shared, so a
// scene with N characters updates N secondaries' targets and then steps ONCE.

import type { RigTemplate } from '@dash/schema'
import type { SolvedSkeleton } from './fk'
import type { VerletWorld } from './verlet'

// Spike B starting points (kept — they read as lag/overshoot/settle, not jelly).
export const SECONDARY_STIFFNESS = 0.28
export const SECONDARY_DAMPING = 0.86
export const SECONDARY_ITERS = 2

export interface SecondaryOptions {
  /** jointId → bone-length scalar (default 1); typically CharacterDoc.proportions. */
  proportions?: Record<string, number>
  /** Verlet-body id in the shared world (default 'secondary'). Distinct per character. */
  id?: string
  stiffness?: number
  damping?: number
  /** Relaxation passes the soft spring runs on (default 2). The length-lock always
   * runs on all of the world's passes regardless. */
  springIters?: number
}

export interface Secondary {
  /** Update the follow targets from the post-additive solved skeleton. Does NOT step
   * the world — the caller steps the ONE shared solver after all secondaries. */
  step(solved: SolvedSkeleton): void
  /** boneId → {ex,ey} verlet endpoint override for render(). Reused object (zero-alloc). */
  overrides(): Record<string, { ex: number; ey: number }>
  /** The shared-world END particle id for a slot (for user poke/drag). undefined until built. */
  endParticleId(boneId: string): number | undefined
  /** The shared-world body id this secondary registered (once built). */
  readonly bodyId: string
}

interface Slot {
  boneId: string
  /** Index into solved.bones (stable = rig.joints order) so step() is a direct read. */
  boneIndex: number
  anchorPid: number
  endPid: number
  springCid: number
}

export function createSecondary(rig: RigTemplate, world: VerletWorld, opts?: SecondaryOptions): Secondary {
  const props = opts?.proportions
  const bodyId = opts?.id ?? 'secondary'
  const stiffness = opts?.stiffness ?? SECONDARY_STIFFNESS
  const damping = opts?.damping ?? SECONDARY_DAMPING
  // No-stretch depends on the length-lock OWNING the final relaxation pass, so the
  // soft spring must run on strictly fewer passes than the world's iteration count
  // (a world built with iterations ≤ springIters would re-introduce stretch).
  const springIters = Math.max(1, Math.min(opts?.springIters ?? SECONDARY_ITERS, world.iterations - 1))

  const lenById = new Map<string, number>()
  for (const j of rig.joints) lenById.set(j.id, j.length * (props?.[j.id] ?? 1))

  // Only slots that name a real joint participate.
  const slotIds = rig.secondarySlots.filter((id) => lenById.has(id))

  let slots: Slot[] | null = null
  const overrideOut: Record<string, { ex: number; ey: number }> = {}
  for (const id of slotIds) overrideOut[id] = { ex: 0, ey: 0 }

  function build(solved: SolvedSkeleton): void {
    const byBone = new Map(solved.bones.map((b) => [b.id, b]))
    const particles = []
    const constraints = []
    const built: Slot[] = []
    let pIndex = 0
    for (const id of slotIds) {
      const bone = byBone.get(id)
      if (!bone) continue
      const boneIndex = solved.bones.indexOf(bone)
      const anchorLocal = pIndex++
      const endLocal = pIndex++
      // anchor sits on the FK origin (pinned); end starts at the FK end (free).
      particles.push({ x: bone.ox, y: bone.oy, pinned: true })
      particles.push({ x: bone.ex, y: bone.ey })
      const restLen = lenById.get(id)!
      // hard length-lock (all iters) then soft spring toward target (springIters).
      const lockCon = { kind: 'distance' as const, a: anchorLocal, b: endLocal, rest: restLen, stiffness: 1 }
      const springCon = { kind: 'spring' as const, a: endLocal, ax: bone.ex, ay: bone.ey, stiffness, iters: springIters }
      constraints.push(lockCon, springCon)
      built.push({ boneId: id, boneIndex, anchorPid: -1, endPid: -1, springCid: -1 })
      // fill real ids after addBody (indices are local→global; we recover them below)
    }
    const handle = world.addBody(bodyId, particles, constraints, 'secondary', { damping, gravityScale: 0 })
    // Map local slot ordering back to global ids: 2 particles + 2 constraints per slot.
    for (let s = 0; s < built.length; s++) {
      built[s].anchorPid = handle.particleIds[s * 2]
      built[s].endPid = handle.particleIds[s * 2 + 1]
      built[s].springCid = handle.constraintIds[s * 2 + 1] // spring is the 2nd constraint
    }
    slots = built
  }

  return {
    step(solved: SolvedSkeleton): void {
      if (!slots) build(solved)
      const bones = solved.bones
      for (const slot of slots!) {
        const bone = bones[slot.boneIndex]
        if (!bone || bone.id !== slot.boneId) continue
        // anchor follows the FK origin (kinematic pin); spring target = FK end (lag).
        world.setPinTarget(slot.anchorPid, bone.ox, bone.oy)
        world.setSpringAnchor(slot.springCid, bone.ex, bone.ey)
      }
    },

    overrides(): Record<string, { ex: number; ey: number }> {
      if (slots) {
        for (const slot of slots) {
          const o = overrideOut[slot.boneId]
          o.ex = world.particleX(slot.endPid)
          o.ey = world.particleY(slot.endPid)
        }
      }
      return overrideOut
    },

    endParticleId(boneId: string): number | undefined {
      return slots?.find((s) => s.boneId === boneId)?.endPid
    },

    get bodyId(): string {
      return bodyId
    },
  }
}
