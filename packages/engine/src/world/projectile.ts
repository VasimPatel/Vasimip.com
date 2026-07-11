// Minimal projectile stepper (L5) — Phase 6b. Pure, DOM-free, deterministic.
//
// This is the Bird Test's LASER primitive, kept deliberately minimal: a projectile
// moves ballistically (transform + velocity, optional gravity), is swept point-vs-
// segments each tick against the LIVE collision world (so a projectile fired after a
// cut flies through the gap), and on impact emits `hit` → the rule table dispatch
// (projectile×damageable→cut). EMITTERS / spawn patterns / patrols are P7/P11 — a
// projectile here is a runtime object created by `fire`, not a world entity.

import type { ComponentKind } from '@dash/schema'
import { STEP_MS } from '../loop'
import { sweptPointVsSegments } from './collision'
import type { MutableWorld } from './holes'
import { dispatch, type RuleTable } from './rules'
import type { VerletWorld } from '../verlet'

export interface ProjectileSpec {
  id?: string
  x: number
  y: number
  /** Velocity in px/s. */
  vx: number
  vy: number
  /** Collision radius (default 0 = point). */
  r?: number
  /** Per-projectile gravity (px/s², +y DOWN). Default 0 → a straight laser. */
  gravity?: number
}

export interface ProjectileState {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  gravity: number
  age: number
}

/** Full serializable sim state — `nextId` is INCLUDED so a restored sim never
 * re-issues an id already carried by a restored in-flight projectile. */
export interface ProjectileSimState {
  nextId: number
  projectiles: ProjectileState[]
}

export interface ProjectileSim {
  fire(spec: ProjectileSpec): string
  /** Advance one tick: move, swept-test, dispatch on hit, cull the dead. */
  step(): void
  active(): ReadonlyArray<Readonly<ProjectileState>>
  getState(): ProjectileSimState
  setState(s: ProjectileSimState): void
}

export interface ProjectileSimOptions {
  stepMs?: number
  /** Hole width for a cut from a projectile hit (passed to dispatch as cutWidth). */
  cutWidth?: number
  /** Ticks before an un-hit projectile is culled (default 600 = 5 s @120 Hz). */
  maxAgeTicks?: number
  verlet?: VerletWorld
}

export function createProjectileSim(mutable: MutableWorld, table: RuleTable, opts: ProjectileSimOptions = {}): ProjectileSim {
  const stepMs = opts.stepMs ?? STEP_MS
  const dt = stepMs / 1000
  const cutWidth = opts.cutWidth
  const maxAge = opts.maxAgeTicks ?? 600
  const verlet = opts.verlet
  let live: ProjectileState[] = []
  let nextId = 1

  // Which entities are damageable is STATIC in 6b (components aren't added/removed
  // at runtime), so classify hit targets from one snapshot at construction instead
  // of cloning the doc on every hit (mutable.doc() deep-clones by contract).
  const damageableIds = new Set<string>()
  for (const e of mutable.doc().entities) if (e.components.damageable) damageableIds.add(e.id)

  /** The relevant collision KIND of a hit panel: damageable if it can be cut, else
   * a plain surface (which the projectile×damageable row won't match → a dud shot). */
  const hitKind = (entity: string): ComponentKind => (damageableIds.has(entity) ? 'damageable' : 'surface')

  function fire(spec: ProjectileSpec): string {
    const id = spec.id ?? `proj:${nextId++}`
    live.push({ id, x: spec.x, y: spec.y, vx: spec.vx, vy: spec.vy, r: spec.r ?? 0, gravity: spec.gravity ?? 0, age: 0 })
    return id
  }

  function step(): void {
    const survivors: ProjectileState[] = []
    for (const p of live) {
      // semi-implicit ballistic integration
      const vy = p.vy + p.gravity * dt
      const dx = p.vx * dt
      const dy = vy * dt
      const segs = mutable.collision().segments
      const hit = sweptPointVsSegments(p.x, p.y, p.r, dx, dy, segs)
      if (hit) {
        const ix = p.x + dx * hit.t
        const iy = p.y + dy * hit.t
        mutable.events.emit('hit', { projectile: p.id, entity: hit.entity, segIndex: hit.segIndex, x: ix, y: iy })
        dispatch(
          {
            event: 'hit',
            a: { entity: p.id, kind: 'projectile' },
            b: { entity: hit.entity, kind: hitKind(hit.entity) },
            point: { x: ix, y: iy },
            normal: { x: hit.nx, y: hit.ny },
            vel: { x: p.vx, y: vy },
            cutWidth,
          },
          table,
          mutable,
          verlet,
        )
        // consumed on impact
        continue
      }
      p.x += dx
      p.y += dy
      p.vy = vy
      p.age++
      if (p.age <= maxAge) survivors.push(p)
    }
    live = survivors
  }

  return {
    fire,
    step,
    active: () => live,
    getState: () => ({ nextId, projectiles: live.map((p) => ({ ...p })) }),
    setState: (s) => {
      nextId = s.nextId
      live = s.projectiles.map((p) => ({ ...p }))
    },
  }
}
