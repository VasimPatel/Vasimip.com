// Collision (L5) — Phase 6a. Pure, DOM-free, deterministic (float arithmetic only).
//
// Shapes: character = capsule (endpoint pair + radius), prop = AABB, panel = segment
// set. The headline primitives are SWEPT: given a from→to motion this tick they
// return the FIRST time-of-impact so a fast mover can never tunnel through a wall.
//
// Collision RESULT is EVENTS ONLY — `blocked` / `landed` / `hit`, emitted on the
// engine bus BY THE CALLER (see `createContactTracker`). RESOLUTION (bounce / stop /
// slide) is 6b rule-table territory; this module only ships the unwired resolution
// PRIMITIVES (`stopAt`, `slideAlong`, `reflect`) and the pure TOI queries.
//
// ── swept-capsule-vs-segment completeness (documented) ───────────────────────────
// In 2D, a translating capsule (r>0) first touches a static segment at a VERTEX-EDGE
// feature: either a capsule endpoint reaching the wall, or a wall endpoint reaching
// the capsule core. (Interior-interior contact at distance r only exists for
// PARALLEL segments, where the endpoints contact at the same instant; crossing —
// interior-interior distance 0 — only happens strictly AFTER the r-contact, so the
// vertex-edge events always fire first.) So the four circle-vs-segment sweeps below
// are a COMPLETE test — no tunnelling. Normals are recomputed from the closest-point
// geometry at the TOI so they always point OUT of the wall toward the capsule.

import type { Box, CollidableComponent, Segment, WorldDocV2 } from '@dash/schema'
import { pointInBox, surfaceGeometry, panelEdges, type SurfaceGeometry } from './surfaces'
import type { CollisionPass, ParticleView } from '../verlet'

export interface Capsule {
  x0: number
  y0: number
  x1: number
  y1: number
  r: number
}

export interface SegmentRef {
  seg: Segment
  entity: string
  /** Index into the owner's `collidable.segments` — the payload 6b cuts reference. */
  segIndex: number
}

export interface SweptHit {
  /** Time-of-impact in [0,1] along the from→to motion. */
  t: number
  /** Outward wall normal (unit), pointing from the wall toward the mover. */
  nx: number
  ny: number
  entity: string
  segIndex: number
  seg: Segment
}

const EPS = 1e-9

// ── low-level geometry ───────────────────────────────────────────────────────────

/** Closest point on segment [x1,y1..x2,y2] to (px,py); returns point + param u. */
function closestOnSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number; u: number } {
  const ex = x2 - x1
  const ey = y2 - y1
  const len2 = ex * ex + ey * ey
  let u = len2 > 0 ? ((px - x1) * ex + (py - y1) * ey) / len2 : 0
  if (u < 0) u = 0
  else if (u > 1) u = 1
  return { x: x1 + ex * u, y: y1 + ey * u, u }
}

/** Closest points between two segments A and B (2D), with the distance. */
function segSegClosest( a: Segment, b: Segment): { ax: number; ay: number; bx: number; by: number; d: number } {
  // Try proper intersection first (distance 0).
  const r_ = { x: a.x2 - a.x1, y: a.y2 - a.y1 }
  const s_ = { x: b.x2 - b.x1, y: b.y2 - b.y1 }
  const denom = r_.x * s_.y - r_.y * s_.x
  if (Math.abs(denom) > EPS) {
    const qp = { x: b.x1 - a.x1, y: b.y1 - a.y1 }
    const t = (qp.x * s_.y - qp.y * s_.x) / denom
    const u = (qp.x * r_.y - qp.y * r_.x) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { ax: a.x1 + r_.x * t, ay: a.y1 + r_.y * t, bx: a.x1 + r_.x * t, by: a.y1 + r_.y * t, d: 0 }
    }
  }
  // Otherwise the min is at an endpoint against the other segment.
  const cands = [
    { p: closestOnSeg(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2), ax: a.x1, ay: a.y1 },
    { p: closestOnSeg(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2), ax: a.x2, ay: a.y2 },
  ]
  const cands2 = [
    { p: closestOnSeg(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2), bx: b.x1, by: b.y1 },
    { p: closestOnSeg(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2), bx: b.x2, by: b.y2 },
  ]
  let best = { ax: 0, ay: 0, bx: 0, by: 0, d: Infinity }
  for (const c of cands) {
    const d = Math.hypot(c.ax - c.p.x, c.ay - c.p.y)
    if (d < best.d) best = { ax: c.ax, ay: c.ay, bx: c.p.x, by: c.p.y, d }
  }
  for (const c of cands2) {
    const d = Math.hypot(c.bx - c.p.x, c.by - c.p.y)
    if (d < best.d) best = { ax: c.p.x, ay: c.p.y, bx: c.bx, by: c.by, d }
  }
  return best
}

/**
 * Earliest time-of-impact of a circle (centre c, radius r) translating by (mx,my)
 * over t∈[0,1] against a static segment. Returns { t, nx, ny } (outward normal from
 * the segment toward the circle) or null. r=0 gives moving-point-vs-segment.
 */
export function sweptCircleVsSegment(
  cx: number,
  cy: number,
  r: number,
  mx: number,
  my: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { t: number; nx: number; ny: number } | null {
  const ex = x2 - x1
  const ey = y2 - y1
  const elen = Math.hypot(ex, ey)
  let best = Infinity
  let bnx = 0
  let bny = 0

  // Line-body contact (only valid where the contact point projects onto the body).
  if (elen > EPS) {
    const nx = -ey / elen
    const ny = ex / elen
    const f0 = (cx - x1) * nx + (cy - y1) * ny // signed distance at t=0
    const fv = mx * nx + my * ny
    const side = f0 >= 0 ? 1 : -1
    if (Math.abs(f0) <= r) {
      // Already within r of the infinite line — contact at t=0 if over the body.
      const u0 = ((cx - x1) * ex + (cy - y1) * ey) / (elen * elen)
      if (u0 >= 0 && u0 <= 1) {
        best = 0
        bnx = side * nx
        bny = side * ny
      }
    }
    if (best > 0 && Math.abs(fv) > EPS) {
      const t = (side * r - f0) / fv
      if (t >= 0 && t <= 1 && t < best) {
        const ccx = cx + mx * t
        const ccy = cy + my * t
        const u = ((ccx - x1) * ex + (ccy - y1) * ey) / (elen * elen)
        if (u >= 0 && u <= 1) {
          best = t
          bnx = side * nx
          bny = side * ny
        }
      }
    }
  }

  // Endpoint (corner) contacts — moving circle vs static point.
  const ends: Array<[number, number]> = [
    [x1, y1],
    [x2, y2],
  ]
  for (const [px, py] of ends) {
    const ox = cx - px
    const oy = cy - py
    const a = mx * mx + my * my
    const b = 2 * (ox * mx + oy * my)
    const c = ox * ox + oy * oy - r * r
    let t: number | null = null
    if (c <= 0) t = 0 // started inside the corner circle
    else if (a > EPS) {
      const disc = b * b - 4 * a * c
      if (disc >= 0) {
        const t0 = (-b - Math.sqrt(disc)) / (2 * a)
        if (t0 >= 0 && t0 <= 1) t = t0
      }
    }
    if (t !== null && t < best) {
      const ccx = cx + mx * t
      const ccy = cy + my * t
      let dnx = ccx - px
      let dny = ccy - py
      const d = Math.hypot(dnx, dny)
      if (d > EPS) {
        dnx /= d
        dny /= d
      } else {
        // Degenerate (centre exactly on the corner) — normal opposes motion.
        const md = Math.hypot(mx, my) || 1
        dnx = -mx / md
        dny = -my / md
      }
      best = t
      bnx = dnx
      bny = dny
    }
  }

  if (best === Infinity) return null
  return { t: best, nx: bnx, ny: bny }
}

/**
 * Earliest TOI of a capsule (endpoints + radius) translating by (dx,dy) against a
 * single static segment. Complete for r>0 (see module header). Normal recomputed
 * from the closest-point geometry at the TOI.
 */
export function sweptCapsuleVsSegment(cap: Capsule, dx: number, dy: number, s: Segment): { t: number; nx: number; ny: number } | null {
  const cands = [
    sweptCircleVsSegment(cap.x0, cap.y0, cap.r, dx, dy, s.x1, s.y1, s.x2, s.y2),
    sweptCircleVsSegment(cap.x1, cap.y1, cap.r, dx, dy, s.x1, s.y1, s.x2, s.y2),
    // wall endpoints swept by -motion against the (static) core segment
    sweptCircleVsSegment(s.x1, s.y1, cap.r, -dx, -dy, cap.x0, cap.y0, cap.x1, cap.y1),
    sweptCircleVsSegment(s.x2, s.y2, cap.r, -dx, -dy, cap.x0, cap.y0, cap.x1, cap.y1),
  ]
  let t = Infinity
  for (const c of cands) if (c && c.t < t) t = c.t
  if (t === Infinity) return null

  // Recompute the outward normal from the geometry at the contact instant: the
  // translated capsule core vs the wall, normal = (core→wall closest) reversed.
  const core: Segment = { x1: cap.x0 + dx * t, y1: cap.y0 + dy * t, x2: cap.x1 + dx * t, y2: cap.y1 + dy * t }
  const cp = segSegClosest(core, s)
  let nx = cp.ax - cp.bx
  let ny = cp.ay - cp.by
  const d = Math.hypot(nx, ny)
  if (d > EPS) {
    nx /= d
    ny /= d
  } else {
    // Crossed (distance ~0): orient the wall normal toward the capsule start.
    const ex = s.x2 - s.x1
    const ey = s.y2 - s.y1
    const el = Math.hypot(ex, ey) || 1
    nx = -ey / el
    ny = ex / el
    const mid = { x: (cap.x0 + cap.x1) / 2, y: (cap.y0 + cap.y1) / 2 }
    if ((mid.x - s.x1) * nx + (mid.y - s.y1) * ny < 0) {
      nx = -nx
      ny = -ny
    }
  }
  return { t, nx, ny }
}

/** Sweep a capsule by (dx,dy) against many segments; return the earliest hit. */
export function sweptCapsuleVsSegments(cap: Capsule, dx: number, dy: number, segs: readonly SegmentRef[]): SweptHit | null {
  let best: SweptHit | null = null
  for (const ref of segs) {
    const h = sweptCapsuleVsSegment(cap, dx, dy, ref.seg)
    if (h && (best === null || h.t < best.t)) best = { t: h.t, nx: h.nx, ny: h.ny, entity: ref.entity, segIndex: ref.segIndex, seg: ref.seg }
  }
  return best
}

/** Sweep a point (radius r, default 0) by (dx,dy) against many segments. */
export function sweptPointVsSegments(x: number, y: number, r: number, dx: number, dy: number, segs: readonly SegmentRef[]): SweptHit | null {
  let best: SweptHit | null = null
  for (const ref of segs) {
    const h = sweptCircleVsSegment(x, y, r, dx, dy, ref.seg.x1, ref.seg.y1, ref.seg.x2, ref.seg.y2)
    if (h && (best === null || h.t < best.t)) best = { t: h.t, nx: h.nx, ny: h.ny, entity: ref.entity, segIndex: ref.segIndex, seg: ref.seg }
  }
  return best
}

// ── unwired resolution PRIMITIVES (6b rule table wires these) ─────────────────────

/** Position along from→to at the TOI, pulled back along the motion by `skin` px so
 * the mover rests just outside the wall (avoids re-penetration jitter). */
export function stopAt(fromX: number, fromY: number, toX: number, toY: number, t: number, skin = 0): { x: number; y: number } {
  const dx = toX - fromX
  const dy = toY - fromY
  const len = Math.hypot(dx, dy)
  const back = len > 0 ? skin / len : 0
  const tt = Math.max(0, Math.min(1, t) - back)
  return { x: fromX + dx * tt, y: fromY + dy * tt }
}

/** Remove the into-wall component of a velocity (keep tangential) — a slide. */
export function slideAlong(vx: number, vy: number, nx: number, ny: number): { vx: number; vy: number } {
  const dot = vx * nx + vy * ny
  return { vx: vx - dot * nx, vy: vy - dot * ny }
}

/** Reflect a velocity about the wall normal with restitution (1 = elastic bounce). */
export function reflect(vx: number, vy: number, nx: number, ny: number, restitution = 1): { vx: number; vy: number } {
  const dot = vx * nx + vy * ny
  return { vx: vx - (1 + restitution) * dot * nx, vy: vy - (1 + restitution) * dot * ny }
}

// ── the collision world (extracted from a WorldDocV2) ─────────────────────────────

export interface PanelCollision {
  entity: string
  box: Box
  geom: SurfaceGeometry
  segments: SegmentRef[]
  /** Whether all four box edges are present (no holes) — the Wall Test predicate.
   * Always true in 6a; 6b's cut flips it per boundary. */
  fullyWalled: boolean
}

export interface CollisionWorld {
  panels: PanelCollision[]
  /** Flat list of every collidable segment (panels) for the swept queries. */
  segments: SegmentRef[]
}

function isSegments(c: CollidableComponent | undefined): c is Extract<CollidableComponent, { shape: 'segments' }> {
  return !!c && c.shape === 'segments'
}

/** Build the queryable collision world from a WorldDocV2 (pure). Panels = entities
 * carrying BOTH a `surface` and a `collidable('segments')` component. */
export function buildCollisionWorld(world: WorldDocV2): CollisionWorld {
  const panels: PanelCollision[] = []
  const segments: SegmentRef[] = []
  for (const e of world.entities) {
    const surf = e.components.surface
    const coll = e.components.collidable
    if (!surf || !isSegments(coll)) continue
    const geom = surfaceGeometry(surf)
    const refs: SegmentRef[] = coll.segments.map((seg, i) => ({ seg, entity: e.id, segIndex: i }))
    // fullyWalled: the collidable still holds all four canonical box edges.
    const want = panelEdges(surf.box)
    const has = (t: Segment): boolean =>
      coll.segments.some((s) => Math.abs(s.x1 - t.x1) < 1e-6 && Math.abs(s.y1 - t.y1) < 1e-6 && Math.abs(s.x2 - t.x2) < 1e-6 && Math.abs(s.y2 - t.y2) < 1e-6)
    const fullyWalled = want.every(has)
    panels.push({ entity: e.id, box: surf.box, geom, segments: refs, fullyWalled })
    for (const ref of refs) segments.push(ref)
  }
  return { panels, segments }
}

/** Wall Test primitive: is a point inside a panel's interior with all four walls
 * solid? On-boundary counts as enclosed (inclusive — documented choice). */
export function isEnclosed(x: number, y: number, cw: CollisionWorld): boolean {
  for (const p of cw.panels) if (p.fullyWalled && pointInBox(x, y, p.box)) return true
  return false
}

export interface NearestSurface {
  entity: string
  segIndex: number
  seg: Segment
  x: number
  y: number
  dist: number
}

/** Nearest collidable segment point to (x,y). */
export function nearestSurface(x: number, y: number, cw: CollisionWorld): NearestSurface | null {
  let best: NearestSurface | null = null
  for (const ref of cw.segments) {
    const cp = closestOnSeg(x, y, ref.seg.x1, ref.seg.y1, ref.seg.x2, ref.seg.y2)
    const d = Math.hypot(x - cp.x, y - cp.y)
    if (best === null || d < best.dist) best = { entity: ref.entity, segIndex: ref.segIndex, seg: ref.seg, x: cp.x, y: cp.y, dist: d }
  }
  return best
}

// ── events + dedupe ───────────────────────────────────────────────────────────────
// Collision emits events, not resolutions. A CONTACT persists across ticks while the
// mover stays pressed against the same wall segment; the tracker emits ONCE on the
// tick contact BEGINS and stays silent while it persists (no event spam). A contact
// must LIFT (absent for ≥1 tick) before it can re-emit. `landed` vs `blocked` is
// classified by the wall normal: an upward-facing normal (ny < -threshold, SVG
// y-down) is a floor landing; anything else is a block.

export interface Contact {
  entity: string
  segIndex: number
  nx: number
  ny: number
}

export interface ContactEvent {
  type: 'blocked' | 'landed'
  entity: string
  segIndex: number
  nx: number
  ny: number
}

export interface ContactTracker {
  /** Diff this tick's contacts against last tick's; return the events to emit. */
  update(contacts: readonly Contact[]): ContactEvent[]
}

// ── verlet collision pass (props/ropes vs panel segments) ────────────────────────
// Projects each awake, unpinned particle out of panel geometry:
//   1. SWEPT prev→cur vs every segment → no tunnelling for a fast faller; snap to the
//      contact and remove the into-wall velocity component (inelastic → rests).
//   2. STATIC: if the particle ended up INSIDE a panel box, push it to the nearest
//      edge (penetration 0) and zero the normal velocity — a rested prop lands
//      exactly on the surface, so its displacement is 0 and it SLEEPS (no jitter).
// Character capsule motion is P7's job (locomotion solver); here we only wire props
// and rope particles, exercised by the scripted rest/drape tests.

/** Outward normal of a box edge at index (0 top,1 right,2 bottom,3 left). */
function edgeOutwardNormal(edgeIndex: number): { nx: number; ny: number } {
  switch (edgeIndex) {
    case 0:
      return { nx: 0, ny: -1 } // top → up
    case 1:
      return { nx: 1, ny: 0 } // right
    case 2:
      return { nx: 0, ny: 1 } // bottom → down
    default:
      return { nx: -1, ny: 0 } // left
  }
}

export function createVerletPanelCollider(cw: CollisionWorld, opts?: { skin?: number }): CollisionPass {
  const skin = opts?.skin ?? 0.01
  return (view: ParticleView): void => {
    for (let i = 0; i < view.count; i++) {
      if (!view.active(i) || view.isPinned(i)) continue
      let x = view.x(i)
      let y = view.y(i)
      const pxx = view.prevX(i)
      const pyy = view.prevY(i)
      const dx = x - pxx
      const dy = y - pyy

      // 1. swept — catch a fast crossing this tick.
      const hit = sweptPointVsSegments(pxx, pyy, 0, dx, dy, cw.segments)
      if (hit) {
        const cx = pxx + dx * hit.t
        const cy = pyy + dy * hit.t
        x = cx + hit.nx * skin
        y = cy + hit.ny * skin
        let vx = view.x(i) - pxx
        let vy = view.y(i) - pyy
        const dot = vx * hit.nx + vy * hit.ny
        if (dot < 0) {
          vx -= dot * hit.nx
          vy -= dot * hit.ny
        }
        view.setPos(i, x, y)
        view.setPrev(i, x - vx, y - vy)
      }

      // 2. static — push out of any box interior to the nearest edge, zero normal vel.
      for (const p of cw.panels) {
        if (!pointInBox(x, y, p.box)) continue
        const edges = [p.geom.roof, p.geom.wallR, p.geom.bottom, p.geom.wallL]
        let bi = 0
        let bd = Infinity
        let bx = x
        let by = y
        for (let e = 0; e < edges.length; e++) {
          const cp = closestOnSeg(x, y, edges[e].x1, edges[e].y1, edges[e].x2, edges[e].y2)
          const d = Math.hypot(x - cp.x, y - cp.y)
          if (d < bd) {
            bd = d
            bi = e
            bx = cp.x
            by = cp.y
          }
        }
        const n = edgeOutwardNormal(bi)
        x = bx + n.nx * skin
        y = by + n.ny * skin
        // zero velocity into the wall
        let vx = x - view.prevX(i)
        let vy = y - view.prevY(i)
        const dot = vx * n.nx + vy * n.ny
        if (dot < 0) {
          vx -= dot * n.nx
          vy -= dot * n.ny
        }
        view.setPos(i, x, y)
        view.setPrev(i, x - vx, y - vy)
      }
    }
  }
}

const FLOOR_NY = -0.5 // normal pointing "up" enough to count as a floor landing

export function createContactTracker(): ContactTracker {
  let prev = new Set<string>()
  const key = (c: Contact): string => `${c.entity}#${c.segIndex}`
  return {
    update(contacts) {
      const now = new Set<string>()
      const events: ContactEvent[] = []
      for (const c of contacts) {
        const k = key(c)
        now.add(k)
        if (!prev.has(k)) {
          const type: ContactEvent['type'] = c.ny < FLOOR_NY ? 'landed' : 'blocked'
          events.push({ type, entity: c.entity, segIndex: c.segIndex, nx: c.nx, ny: c.ny })
        }
      }
      prev = now
      return events
    },
  }
}
