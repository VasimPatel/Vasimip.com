// Interaction rule table + dispatcher (L5) — Phase 6b. Pure, DOM-free.
//
// Rows are DATA (schema `RuleRow`): a component-pair + event → a list of the CLOSED
// world-layer `WorldResponse`s (cut | impulse | support | emitEvent). `dispatch`
// finds the rows matching a contact/hit event (pair matched ORDER-INDEPENDENTLY) and
// executes each response against the 6a primitives:
//   cut       → mutableWorld.cut at the impact point mapped to the nearest edge interval
//   impulse   → verlet.applyImpulse on the disturbable body (P5 +y DOWN convention)
//   support   → stand/rest resolution (stopAt) surfaced as a `support` event for P7
//   emitEvent → a named event on the bus
//
// DEVIATION FROM §5 (flagged): §5 typed responses as Intent[]; 6b uses the closed
// world-layer subset (see schema/rules.ts). P7's dispatcher extends this to intents.
//
// The seed table (DEFAULT_RULES) is an INLINE default (documented choice: no
// content/engine/rules.json yet — a file adds no capability now, and "rules are data"
// is proven by the swap test that clones + edits a row and observes changed behavior).

import type { RuleRow, WorldResponse, ComponentKind, Box, HoleEdge, Segment } from '@dash/schema'
import type { MutableWorld, HoleSpec } from './holes'
import type { VerletWorld } from '../verlet'
import { stopAt, type PanelCollision } from './collision'

/** §2 seed rows, as data. Wall vs surface is one component (`surface`); the CONTACT
 * event (`blocked` for a wall hit, `landed` for a floor rest) distinguishes them —
 * exactly how 6a's ContactTracker classifies by the wall normal. */
export const DEFAULT_RULES: readonly RuleRow[] = [
  { a: 'projectile', b: 'damageable', event: 'hit', responses: [{ kind: 'cut' }] }, // projectile×damageable→cut
  { a: 'locomotion', b: 'surface', event: 'blocked', responses: [{ kind: 'emitEvent', event: 'blocked' }] }, // character×wall→blocked
  { a: 'locomotion', b: 'disturbable', event: 'contact', responses: [{ kind: 'impulse', scale: 1 }] }, // character×disturbable→impulse
  { a: 'locomotion', b: 'surface', event: 'landed', responses: [{ kind: 'support' }] }, // character×surface→support
]

export const DEFAULT_CUT_WIDTH = 24

export interface RuleEntity {
  entity: string
  kind: ComponentKind
}

/** The context of a contact/hit event handed to dispatch. */
export interface RuleEventCtx {
  event: string
  a: RuleEntity
  b: RuleEntity
  /** Impact point (world space) — used to place a cut and a support stand point. */
  point?: { x: number; y: number }
  /** Outward wall normal at the contact (for support pull-back / impulse fallback). */
  normal?: { x: number; y: number }
  /** Mover velocity (px/s) — the default impulse direction (P5 +y DOWN). */
  vel?: { x: number; y: number }
  /** Default hole width for a cut response (overridden by response.width). */
  cutWidth?: number
}

export type DispatchAction =
  | { kind: 'cut'; entity: string; holeId: string }
  | { kind: 'impulse'; entity: string; vx: number; vy: number; applied: boolean }
  | { kind: 'support'; entity: string; x: number; y: number }
  | { kind: 'emitEvent'; event: string }

export interface DispatchResult {
  matchedRows: number
  actions: DispatchAction[]
}

export interface RuleTable {
  readonly rows: readonly RuleRow[]
  /** Rows matching (kindA, kindB, event), pair order-independent. */
  match(kindA: ComponentKind, kindB: ComponentKind, event: string): RuleRow[]
}

function pairKey(a: string, b: string, event: string): string {
  return (a < b ? `${a}|${b}` : `${b}|${a}`) + `#${event}`
}

export function createRuleTable(rows: readonly RuleRow[] = DEFAULT_RULES): RuleTable {
  const index = new Map<string, RuleRow[]>()
  for (const row of rows) {
    const k = pairKey(row.a, row.b, row.event)
    const list = index.get(k) ?? []
    list.push(row)
    index.set(k, list)
  }
  return {
    rows,
    match(kindA, kindB, event) {
      return index.get(pairKey(kindA, kindB, event)) ?? []
    },
  }
}

// ── impact point → nearest edge interval ─────────────────────────────────────────
// Maps to one of the four physical box edges (roof/wallL/wallR/bottom). floorIn is
// the interior anchor line — never a projectile/contact target — so it is excluded.

interface BoxEdge {
  edge: HoleSpec['edge']
  ox: number
  oy: number
  dx: number
  dy: number
  len: number
}

function boxEdges(box: Box): BoxEdge[] {
  return [
    { edge: 'roof', ox: box.x, oy: box.y, dx: 1, dy: 0, len: box.w },
    { edge: 'bottom', ox: box.x, oy: box.y + box.h, dx: 1, dy: 0, len: box.w },
    { edge: 'wallL', ox: box.x, oy: box.y, dx: 0, dy: 1, len: box.h },
    { edge: 'wallR', ox: box.x + box.w, oy: box.y, dx: 0, dy: 1, len: box.h },
  ]
}

/** Nearest edge interval of `box` to (x,y), centering `width` on the projection. */
export function nearestEdgeInterval(box: Box, x: number, y: number, width: number): HoleSpec {
  let best: BoxEdge | null = null
  let bestDist = Infinity
  let bestT = 0
  for (const e of boxEdges(box)) {
    const rx = x - e.ox
    const ry = y - e.oy
    let t = rx * e.dx + ry * e.dy
    if (t < 0) t = 0
    else if (t > e.len) t = e.len
    const cx = e.ox + e.dx * t
    const cy = e.oy + e.dy * t
    const d = Math.hypot(x - cx, y - cy)
    if (d < bestDist) {
      bestDist = d
      best = e
      bestT = t
    }
  }
  const e = best!
  const w = Math.max(0, Math.min(width, e.len))
  const start = Math.max(0, Math.min(bestT - w / 2, e.len - w))
  return { edge: e.edge, start, width: w }
}

// ── explicit-edge projection (a response naming `edge` picks the edge FIRST, then
// the impact is projected onto THAT edge — never onto the nearest one and renamed,
// which would parameterize `start` for the wrong edge). Uses the panel's derived
// surface geometry so `floorIn` works too. ────────────────────────────────────────

function edgeSegmentOf(panel: PanelCollision, edge: HoleEdge): Segment {
  switch (edge) {
    case 'roof':
      return panel.geom.roof
    case 'bottom':
      return panel.geom.bottom
    case 'wallL':
      return panel.geom.wallL
    case 'wallR':
      return panel.geom.wallR
    case 'floorIn':
      return panel.geom.floorIn
  }
}

/** Interval of `width` on the NAMED edge, centered on the projection of (x,y). */
function intervalOnEdge(panel: PanelCollision, edge: HoleEdge, x: number, y: number, width: number): HoleSpec {
  const s = edgeSegmentOf(panel, edge)
  const ex = s.x2 - s.x1
  const ey = s.y2 - s.y1
  const len = Math.hypot(ex, ey)
  if (len <= 0) return { edge, start: 0, width }
  const ux = ex / len
  const uy = ey / len
  let t = (x - s.x1) * ux + (y - s.y1) * uy
  if (t < 0) t = 0
  else if (t > len) t = len
  const w = Math.min(width, len)
  const start = Math.max(0, Math.min(t - w / 2, len - w))
  return { edge, start, width: w }
}

/** Interval of `width` centered on the NAMED edge (no impact point). */
function centeredInterval(panel: PanelCollision, edge: HoleEdge, width: number): HoleSpec {
  const s = edgeSegmentOf(panel, edge)
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
  const w = Math.min(width, len)
  return { edge, start: Math.max(0, (len - w) / 2), width: w }
}

// ── dispatch ────────────────────────────────────────────────────────────────────

function pickByKind(ctx: RuleEventCtx, kind: ComponentKind): RuleEntity | null {
  if (ctx.a.kind === kind) return ctx.a
  if (ctx.b.kind === kind) return ctx.b
  return null
}

/** The mover in a pair with a surface = the non-surface entity. */
function mover(ctx: RuleEventCtx): RuleEntity {
  return ctx.a.kind === 'surface' ? ctx.b : ctx.a
}

export function dispatch(ctx: RuleEventCtx, table: RuleTable, mutable: MutableWorld, verlet?: VerletWorld): DispatchResult {
  const rows = table.match(ctx.a.kind, ctx.b.kind, ctx.event)
  const actions: DispatchAction[] = []
  for (const row of rows) {
    for (const r of row.responses) {
      execute(r, ctx, mutable, verlet, actions)
    }
  }
  return { matchedRows: rows.length, actions }
}

function execute(r: WorldResponse, ctx: RuleEventCtx, mutable: MutableWorld, verlet: VerletWorld | undefined, actions: DispatchAction[]): void {
  switch (r.kind) {
    case 'cut': {
      const target = pickByKind(ctx, 'damageable')
      if (!target) return
      const panel = mutable.collision().panels.find((p) => p.entity === target.entity)
      if (!panel) return
      const width = r.width ?? ctx.cutWidth ?? DEFAULT_CUT_WIDTH
      let spec: HoleSpec
      if (ctx.point) {
        // Explicit edge: project the impact onto THAT edge. Otherwise: nearest edge.
        spec = r.edge ? intervalOnEdge(panel, r.edge, ctx.point.x, ctx.point.y, width) : nearestEdgeInterval(panel.box, ctx.point.x, ctx.point.y, width)
      } else {
        // No impact point: center the cut on the named (or roof) edge.
        spec = centeredInterval(panel, r.edge ?? 'roof', width)
      }
      // Data-driven responses must not crash the sim loop: cut() rejects impossible
      // cuts (no coverage on the edge, empty interval, …) with a throw — dispatch
      // converts that into a LOUD trace event instead of an engine crash. Direct
      // cut() callers still get the throw.
      let holeId: string
      try {
        holeId = mutable.cut(target.entity, spec, { healAfterMs: r.healAfterMs, persistScope: r.persistScope })
      } catch (err) {
        mutable.events.emit('cutRejected', { entity: target.entity, edge: spec.edge, start: spec.start, width: spec.width, reason: err instanceof Error ? err.message : String(err) })
        return
      }
      actions.push({ kind: 'cut', entity: target.entity, holeId })
      return
    }
    case 'impulse': {
      const target = pickByKind(ctx, 'disturbable')
      if (!target) return
      const scale = r.scale ?? 1
      let vx: number
      let vy: number
      if (r.vec) {
        vx = r.vec[0]
        vy = r.vec[1]
      } else if (ctx.vel) {
        vx = ctx.vel.x * scale
        vy = ctx.vel.y * scale
      } else if (ctx.normal) {
        // Push INTO the prop (opposite the outward normal), P5 +y DOWN.
        vx = -ctx.normal.x * scale
        vy = -ctx.normal.y * scale
      } else {
        vx = 0
        vy = scale // fall onto it, downward
      }
      let applied = false
      if (verlet) {
        verlet.applyImpulse(target.entity, vx, vy)
        applied = true
      }
      actions.push({ kind: 'impulse', entity: target.entity, vx, vy, applied })
      return
    }
    case 'support': {
      const m = mover(ctx)
      // Stand/rest resolution via stopAt: rest just outside the surface along the
      // contact normal. Without the real from→to motion (P7's locomotion solver has
      // it), the contact point IS the stand point; P7 will pass the swept motion.
      let x = ctx.point?.x ?? 0
      let y = ctx.point?.y ?? 0
      if (ctx.point && ctx.normal) {
        const s = stopAt(x, y, x + ctx.normal.x, y + ctx.normal.y, 1, 0)
        x = s.x
        y = s.y
      }
      mutable.events.emit('support', { entity: m.entity, x, y })
      actions.push({ kind: 'support', entity: m.entity, x, y })
      return
    }
    case 'emitEvent': {
      mutable.events.emit(r.event, { a: ctx.a.entity, b: ctx.b.entity, point: ctx.point })
      actions.push({ kind: 'emitEvent', event: r.event })
      return
    }
  }
}
