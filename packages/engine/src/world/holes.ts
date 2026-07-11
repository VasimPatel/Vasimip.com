// Mutable boundaries — holes + heal (L5) — Phase 6b. Pure logic, DOM-free,
// deterministic (tick-driven, NO wall clock), plain-JSON serializable.
//
// `createMutableWorld(world)` owns the LIVE world state = the doc + runtime cuts. A
// CUT takes a hole out of a panel's `collidable.segments` (the 6a source of truth),
// which ATOMICALLY changes ALL THREE derived representations because they are all
// rebuilt from those segments on a mutation counter:
//   • collision   — buildCollisionWorld(liveDoc): a swept capsule now passes through
//                   the gap; `fullyWalled` (→ isEnclosed) flips for a breached panel.
//   • traversal   — buildTraversalGraph(liveDoc): a walk/hop edge whose ground path
//                   was pruned by that wall re-appears through the breach.
//   • render data — holesInPanel(panel): position/extent/edge for a torn-edge mask.
//
// ── HOLE PARAMETERIZATION (chosen: EDGE-INTERVAL) ────────────────────────────────
// A hole is `{ edge, start, width }`: a sub-interval [start, start+width] measured in
// PX along a named panel edge from that edge's canonical origin. This is the HONEST
// primitive for a SEGMENT SET — a cut is literally interval subtraction on the edge's
// segment, producing 0/1/2 flanking pieces. (A `{x,y,r}` disc form was rejected: it
// would force an arc-vs-segment boolean and a non-segment residual, i.e. a second
// geometry kind the collision layer doesn't speak.) Impact points from the rule table
// are mapped to this form by projecting onto the nearest edge (see rules.ts).
//
// ── HEAL (tick-driven) ───────────────────────────────────────────────────────────
// stepMutations() advances one sim tick and counts down each healing hole's timer;
// when it reaches zero the hole heals — segments/graph/render restore ATOMICALLY and
// a `healed` event fires. Because live segments are RECOMPUTED from the untouched
// originals minus the active holes, removing the last hole on an edge passes the
// original segment through UNCHANGED → byte-identical restore (hashState-equal).
//
// persistScope: 'none' heals after healAfterMs; 'session' stays until the world is
// rebuilt (setState/new world); 'saved' is a SCHEMA KNOB ONLY — rejected at runtime.

import type { CharacterDoc, EntityDoc, HoleEdge, HolePersistScope, LocomotionCaps, Segment, SurfaceComponent, Vec2Delta, Box, WorldDocV2 } from '@dash/schema'
import { STEP_MS } from '../loop'
import { createEventBus, type EventBus, type TraceEvent } from '../events'
import { buildCollisionWorld, isEnclosed as isEnclosedIn, type CollisionWorld } from './collision'
import { buildTraversalGraph, type TraversalGraph } from './traversal'

/** Default heal delay — "the notebook redraws itself" a beat after the breach. */
export const DEFAULT_HEAL_MS = 1200

/** Residual segments adjacent to a hole are trimmed back by this much (px) at each
 * hole-created boundary, so a radius-0 swept point aimed EXACTLY at the boundary
 * passes through the gap instead of clipping the residual's endpoint. Skin-sized
 * (matches the collision passes' 0.01 skin). Only interior (hole-created) boundaries
 * are trimmed — original segment endpoints are untouched, so removing the last hole
 * restores the original segment byte-identically. */
export const HOLE_EDGE_TRIM = 0.01

const EDGE_EPS = 1e-6

const HOLE_EDGES: ReadonlySet<string> = new Set(['roof', 'wallL', 'wallR', 'bottom', 'floorIn'])

export type HoleId = string

/** The authored/impact cut shape (edge-interval — see module header). */
export interface HoleSpec {
  edge: HoleEdge
  start: number
  width: number
}

export interface CutOpts {
  healAfterMs?: number
  persistScope?: HolePersistScope
}

/** Live record of one active hole — carries the render extent (world-space span of
 * the removed interval) so a torn-edge mask can be drawn straight from it. */
export interface HoleRecord {
  id: HoleId
  panel: string
  edge: HoleEdge
  start: number
  width: number
  /** World-space endpoints of the removed span (for the torn-edge render mask). */
  x1: number
  y1: number
  x2: number
  y2: number
  persistScope: HolePersistScope
  /** Effective heal delay (null = never auto-heals, i.e. 'session'). */
  healAfterMs: number | null
  /** Remaining heal ticks (null = not counting down). */
  remainingTicks: number | null
}

/** Serializable mutable-world state (plain JSON — hashState-able, §3 rule 1). */
export interface MutableWorldState {
  tick: number
  nextId: number
  holes: HoleRecord[]
}

export interface MutableWorldOptions {
  /** Character whose caps drive the traversal graph (traversal() throws without one). */
  character?: CharacterDoc
  /** Or just caps — a synthetic character is built around them. */
  caps?: LocomotionCaps
  /** Shared event bus (else an internal one, tick-stamped by stepMutations). */
  events?: EventBus
  /** Heal-timer tick duration in ms (default STEP_MS). */
  stepMs?: number
}

export interface MutableWorld {
  /** Cut a hole; returns its id. ATOMIC across collision/traversal/render/isEnclosed. */
  cut(panelEntityId: string, hole: HoleSpec, opts?: CutOpts): HoleId
  /** Heal a specific hole now (idempotent). Also invoked by the heal timer. */
  heal(holeId: HoleId): boolean
  /** Advance one sim tick: count down heal timers, heal any that elapse. */
  stepMutations(): void
  /** Active holes on a panel (render data for the torn mask). */
  holesInPanel(panelId: string): HoleRecord[]
  /** Every active hole. */
  allHoles(): HoleRecord[]
  /** The live collision world (memoized on the mutation counter). */
  collision(): CollisionWorld
  /** The live traversal graph (memoized; needs a character/caps). */
  traversal(capsOverride?: LocomotionCaps): TraversalGraph
  isEnclosed(x: number, y: number): boolean
  /** A SNAPSHOT of the live doc (segments reflect active holes). Returns a deep
   * CLONE on every call — mutating it can never desync the memoized collision/
   * traversal caches (which key on an internal mutation counter). Documented cost:
   * one structuredClone per call; this is an inspection/debug surface, not a
   * hot-path — engine internals read the live doc directly. */
  doc(): WorldDocV2
  events: EventBus
  trace(): readonly TraceEvent[]
  getTick(): number
  getState(): MutableWorldState
  setState(s: MutableWorldState): void
}

// ── edge geometry (edge name → origin + unit dir + length, from the box) ──────────

interface EdgeGeom {
  ox: number
  oy: number
  dx: number
  dy: number
  len: number
}

function edgeGeom(box: Box, anchor: Vec2Delta, edge: HoleEdge): EdgeGeom {
  switch (edge) {
    case 'roof':
      return { ox: box.x, oy: box.y, dx: 1, dy: 0, len: box.w }
    case 'bottom':
      return { ox: box.x, oy: box.y + box.h, dx: 1, dy: 0, len: box.w }
    case 'wallL':
      return { ox: box.x, oy: box.y, dx: 0, dy: 1, len: box.h }
    case 'wallR':
      return { ox: box.x + box.w, oy: box.y, dx: 0, dy: 1, len: box.h }
    case 'floorIn':
      return { ox: box.x, oy: box.y + anchor.dy, dx: 1, dy: 0, len: box.w }
  }
}

/** Is (px,py) on the edge's line? Returns the param t (px along dir) too. */
function onEdge(px: number, py: number, g: EdgeGeom): { on: boolean; t: number } {
  const rx = px - g.ox
  const ry = py - g.oy
  const t = rx * g.dx + ry * g.dy
  const perp = rx * g.dy - ry * g.dx // (p-o) × dir  (unit dir ⇒ this is the perpendicular distance)
  return { on: Math.abs(perp) < EDGE_EPS, t }
}

function segFromParam(g: EdgeGeom, s: number, e: number): Segment {
  return { x1: g.ox + g.dx * s, y1: g.oy + g.dy * s, x2: g.ox + g.dx * e, y2: g.oy + g.dy * e }
}

/** Subtract hole intervals from [a,b]; return the ascending residual sub-intervals.
 * Every residual boundary CREATED BY A HOLE is pulled back by `trim` (see
 * HOLE_EDGE_TRIM); the interval's own endpoints a/b are never trimmed. */
function subtractIntervals(a: number, b: number, holes: Array<{ s: number; e: number }>, trim: number): Array<[number, number]> {
  const iv = holes
    .map((h) => [Math.max(a, Math.min(h.s, h.e)), Math.min(b, Math.max(h.s, h.e))] as [number, number])
    .filter(([s, e]) => e - s > EDGE_EPS)
    .sort((x, y) => x[0] - y[0])
  const out: Array<[number, number]> = []
  let cur = a
  let curFromHole = false // did a hole (not `a` itself) set the current start?
  for (const [s, e] of iv) {
    if (s > cur + EDGE_EPS) {
      const s0 = curFromHole ? cur + trim : cur
      const e0 = s - trim // `s` is a hole start ⇒ always an interior boundary
      if (e0 - s0 > EDGE_EPS) out.push([s0, e0])
    }
    if (e > cur) {
      cur = e
      curFromHole = true
    }
    if (cur >= b) break
  }
  if (b - cur > EDGE_EPS) {
    const s0 = curFromHole ? cur + trim : cur
    if (b - s0 > EDGE_EPS) out.push([s0, b])
  }
  return out
}

/** Recompute a panel's live segments = originals minus every active hole on it.
 *
 * Holes are matched to segments by LINE GEOMETRY (the hole's world-space span vs
 * the segment's infinite line), NOT by edge name — so coincident named edges (e.g.
 * `floorIn` === `roof` when anchor.dy = 0) subtract correctly regardless of which
 * name a hole was cut under, and healing one of several coincident holes leaves
 * exactly the others' geometry removed. A segment not on any hole's line passes
 * through UNCHANGED (byte-identical → heal restores exactly). */
function computeLiveSegments(original: readonly Segment[], holes: readonly HoleRecord[]): Segment[] {
  const out: Segment[] = []
  for (const seg of original) {
    const ex = seg.x2 - seg.x1
    const ey = seg.y2 - seg.y1
    const len = Math.hypot(ex, ey)
    if (len <= EDGE_EPS) {
      out.push(seg)
      continue
    }
    const ux = ex / len
    const uy = ey / len
    // Hole intervals on THIS segment's line, in the segment's own param [0,len].
    const iv: Array<{ s: number; e: number }> = []
    for (const h of holes) {
      const d1 = (h.x1 - seg.x1) * uy - (h.y1 - seg.y1) * ux // perp distance of hole ends
      const d2 = (h.x2 - seg.x1) * uy - (h.y2 - seg.y1) * ux
      if (Math.abs(d1) > EDGE_EPS || Math.abs(d2) > EDGE_EPS) continue // not on this line
      const t1 = (h.x1 - seg.x1) * ux + (h.y1 - seg.y1) * uy
      const t2 = (h.x2 - seg.x1) * ux + (h.y2 - seg.y1) * uy
      iv.push({ s: Math.min(t1, t2), e: Math.max(t1, t2) })
    }
    if (iv.length === 0) {
      out.push(seg) // untouched — byte-identical pass-through
      continue
    }
    const residual = subtractIntervals(0, len, iv, HOLE_EDGE_TRIM)
    for (const [s, e] of residual) out.push({ x1: seg.x1 + ux * s, y1: seg.y1 + uy * s, x2: seg.x1 + ux * e, y2: seg.y1 + uy * e })
  }
  return out
}

/** Total length of original-segment coverage lying on edge `g` within [s,e] — the
 * cut() precondition: an edge with zero coverage has NO collision geometry to
 * remove, so cutting it would desync render/events from collision/traversal. */
function coverageOnEdge(g: EdgeGeom, s: number, e: number, original: readonly Segment[]): number {
  let cov = 0
  for (const seg of original) {
    const p1 = onEdge(seg.x1, seg.y1, g)
    const p2 = onEdge(seg.x2, seg.y2, g)
    if (!p1.on || !p2.on) continue
    const lo = Math.min(p1.t, p2.t)
    const hi = Math.max(p1.t, p2.t)
    cov += Math.max(0, Math.min(hi, e) - Math.max(lo, s))
  }
  return cov
}

// ── the mutable world ─────────────────────────────────────────────────────────────

function clone<T>(v: T): T {
  return structuredClone(v)
}

function isSegments(c: EntityDoc['components']['collidable']): c is Extract<NonNullable<EntityDoc['components']['collidable']>, { shape: 'segments' }> {
  return !!c && c.shape === 'segments'
}

interface PanelRec {
  entity: string
  box: Box
  anchor: Vec2Delta
  original: Segment[]
  /** The live collidable.segments array on the doc (rewritten on each mutation). */
}

export function createMutableWorld(world: WorldDocV2, opts: MutableWorldOptions = {}): MutableWorld {
  const liveDoc: WorldDocV2 = clone(world)
  const stepMs = opts.stepMs ?? STEP_MS
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new Error(`createMutableWorld: stepMs must be a finite number > 0, got ${stepMs}`)

  let mtick = 0
  const events = opts.events ?? createEventBus(() => mtick)

  const character: CharacterDoc | null =
    opts.character ??
    (opts.caps
      ? { id: '__mutable_caps', rig: '__none', personality: { energy: 0.5, bounciness: 0.5, confidence: 0.5, sloppiness: 0.5 }, locomotion: opts.caps }
      : null)

  // Index the cuttable panels (surface + collidable('segments')) and snapshot originals.
  const panels = new Map<string, PanelRec>()
  const docEntityById = new Map<string, EntityDoc>()
  for (const e of liveDoc.entities) {
    docEntityById.set(e.id, e)
    const surf = e.components.surface as SurfaceComponent | undefined
    const coll = e.components.collidable
    if (!surf || !isSegments(coll)) continue
    panels.set(e.id, { entity: e.id, box: surf.box, anchor: surf.anchor, original: clone(coll.segments) })
  }

  const holesById = new Map<HoleId, HoleRecord>()
  const holesByPanel = new Map<string, Set<HoleId>>()
  let nextId = 1
  let mutationCounter = 0

  // ── memoized derivations ────────────────────────────────────────────────────────
  let collMemo: { c: number; w: CollisionWorld } | null = null
  let travMemo: { c: number; g: TraversalGraph } | null = null

  function rebuildPanelSegments(entity: string): void {
    const rec = panels.get(entity)
    if (!rec) return
    const active: HoleRecord[] = []
    for (const id of holesByPanel.get(entity) ?? []) active.push(holesById.get(id)!)
    const segs = active.length === 0 ? clone(rec.original) : computeLiveSegments(rec.original, active)
    const e = docEntityById.get(entity)!
    ;(e.components.collidable as Extract<NonNullable<EntityDoc['components']['collidable']>, { shape: 'segments' }>).segments = segs
  }

  function invalidate(): void {
    mutationCounter++
    collMemo = null
    travMemo = null
  }

  function collision(): CollisionWorld {
    if (!collMemo || collMemo.c !== mutationCounter) collMemo = { c: mutationCounter, w: buildCollisionWorld(liveDoc) }
    return collMemo.w
  }

  function traversal(capsOverride?: LocomotionCaps): TraversalGraph {
    if (!character) throw new Error('createMutableWorld: traversal() needs a `character` or `caps` option')
    if (capsOverride) return buildTraversalGraph(liveDoc, character, capsOverride) // override is not memoized
    if (!travMemo || travMemo.c !== mutationCounter) travMemo = { c: mutationCounter, g: buildTraversalGraph(liveDoc, character) }
    return travMemo.g
  }

  function cut(panelEntityId: string, hole: HoleSpec, cutOpts: CutOpts = {}): HoleId {
    // ── validation — ALL of it before any mutation or event (reject = no hole,
    //    no segment change, no event; three-representation coherence by refusal) ──
    const rec = panels.get(panelEntityId)
    if (!rec) throw new Error(`cut: entity ${JSON.stringify(panelEntityId)} is not a cuttable panel (needs surface + collidable('segments'))`)
    const dmg = docEntityById.get(panelEntityId)!.components.damageable
    if (!dmg) throw new Error(`cut: entity ${JSON.stringify(panelEntityId)} has no 'damageable' component — only damageable panels can be cut`)
    if (!HOLE_EDGES.has(hole.edge)) throw new Error(`cut: unknown edge ${JSON.stringify(hole.edge)} (roof | wallL | wallR | bottom | floorIn)`)
    if (!Number.isFinite(hole.start) || !Number.isFinite(hole.width)) throw new Error(`cut: start/width must be finite numbers, got start=${hole.start} width=${hole.width}`)
    if (hole.width <= 0) throw new Error(`cut: width must be > 0, got ${hole.width}`)
    const persistScope: HolePersistScope = cutOpts.persistScope ?? dmg.persistScope ?? 'none'
    if (persistScope === 'saved') {
      throw new Error("cut: persistScope 'saved' is a schema knob only — the 6b runtime accepts 'none' | 'session' (saved cuts land post-P9)")
    }
    const g = edgeGeom(rec.box, rec.anchor, hole.edge)
    // Clamp BOTH endpoints to the edge — the hole is the INTERSECTION of the request
    // with the edge (a request must never grow past its own end). Empty ⇒ reject.
    const s = Math.max(0, hole.start)
    const e = Math.min(g.len, hole.start + hole.width)
    if (e - s <= EDGE_EPS) throw new Error(`cut: interval [${hole.start}, ${hole.start + hole.width}] does not intersect the ${hole.edge} edge (length ${g.len})`)
    // The target edge must actually EXIST in the panel's collision geometry: without
    // positive original-segment coverage a "cut" would change render state + events
    // while collision/traversal stay identical — a silent three-representation desync.
    if (coverageOnEdge(g, s, e, rec.original) <= EDGE_EPS) {
      throw new Error(`cut: no collidable segment lies on the ${hole.edge} edge of ${JSON.stringify(panelEntityId)} within [${s}, ${e}] — refusing a render-only hole`)
    }
    const healAfterMs = persistScope === 'session' ? null : cutOpts.healAfterMs ?? dmg.healAfterMs ?? DEFAULT_HEAL_MS
    if (healAfterMs !== null && (!Number.isFinite(healAfterMs) || healAfterMs < 0)) throw new Error(`cut: healAfterMs must be a finite number >= 0, got ${healAfterMs}`)
    const remainingTicks = healAfterMs === null ? null : Math.max(1, Math.ceil(healAfterMs / stepMs))
    const start = s
    const width = e - s
    const p0 = segFromParam(g, start, start + width)
    const id: HoleId = `hole:${nextId++}`
    const record: HoleRecord = {
      id,
      panel: panelEntityId,
      edge: hole.edge,
      start,
      width,
      x1: p0.x1,
      y1: p0.y1,
      x2: p0.x2,
      y2: p0.y2,
      persistScope,
      healAfterMs,
      remainingTicks,
    }
    holesById.set(id, record)
    let set = holesByPanel.get(panelEntityId)
    if (!set) {
      set = new Set()
      holesByPanel.set(panelEntityId, set)
    }
    set.add(id)
    rebuildPanelSegments(panelEntityId)
    invalidate()
    events.emit('cut', { holeId: id, panel: panelEntityId, edge: hole.edge, start, width, x1: p0.x1, y1: p0.y1, x2: p0.x2, y2: p0.y2 })
    return id
  }

  function heal(holeId: HoleId): boolean {
    const record = holesById.get(holeId)
    if (!record) return false
    holesById.delete(holeId)
    holesByPanel.get(record.panel)?.delete(holeId)
    rebuildPanelSegments(record.panel)
    invalidate()
    events.emit('healed', { holeId, panel: record.panel, edge: record.edge })
    return true
  }

  function stepMutations(): void {
    mtick++
    const toHeal: HoleId[] = []
    for (const h of holesById.values()) {
      if (h.remainingTicks === null) continue
      h.remainingTicks--
      if (h.remainingTicks <= 0) toHeal.push(h.id)
    }
    for (const id of toHeal) heal(id)
  }

  function holesInPanel(panelId: string): HoleRecord[] {
    const set = holesByPanel.get(panelId)
    if (!set) return []
    const out: HoleRecord[] = []
    for (const id of set) out.push({ ...holesById.get(id)! })
    return out
  }

  function allHoles(): HoleRecord[] {
    return Array.from(holesById.values()).map((h) => ({ ...h }))
  }

  function getState(): MutableWorldState {
    return { tick: mtick, nextId, holes: allHoles() }
  }

  function setState(s: MutableWorldState): void {
    mtick = s.tick
    nextId = s.nextId
    holesById.clear()
    holesByPanel.clear()
    for (const h of s.holes) {
      const rec: HoleRecord = { ...h }
      holesById.set(rec.id, rec)
      let set = holesByPanel.get(rec.panel)
      if (!set) {
        set = new Set()
        holesByPanel.set(rec.panel, set)
      }
      set.add(rec.id)
    }
    for (const entity of panels.keys()) rebuildPanelSegments(entity)
    invalidate()
  }

  return {
    cut,
    heal,
    stepMutations,
    holesInPanel,
    allHoles,
    collision,
    traversal,
    isEnclosed: (x, y) => isEnclosedIn(x, y, collision()),
    doc: () => clone(liveDoc),
    events,
    trace: () => events.trace(),
    getTick: () => mtick,
    getState,
    setState,
  }
}
