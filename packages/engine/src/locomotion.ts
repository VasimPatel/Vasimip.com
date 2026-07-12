// Locomotion solver (L4) — advances a character toward the current movement intent
// each tick against the LIVE world geometry, raising milestone events. This is the
// Phase 7 punt landing: the character's MOTION is solved here (swept capsule vs the
// page's live collision world), not precompiled into an absolute-time timeline.
//
// It composes the existing pieces rather than reinventing them:
//   • GROUND (moveTo)  — the P4 gait drives pose + world root velocity toward the
//     target along the floor line; a swept capsule tests the step each tick. A wall
//     hit STOPS the character at contact (stopAt) and enters `blocked` (the bounce is
//     7b). Arrival within tolerance completes and hands off to idle — the blender's
//     persistent velocity (P3) smooths the gait→idle transition, no pop.
//   • JUMP (jumpTo)    — a ballistic arc solved from the character's LocomotionCaps.
//     AUTHORED FEEL (the plan's "intents carry authored clips" amendment): the jump
//     clip's anticipation phase plays first; the physics launch is SYNCED to the
//     clip's `launch` marker tick (not a fixed countdown); airborne is ballistic root
//     motion + the clip's tuck; landing fires on the collision `landed` EVENT (not a
//     precomputed time) and swaps to the land-squash clip; `arrived` after a settle.
//   • FLY (flyTo/flyThrough) — steering (seek at caps.flySpeed; arrival slowdown for
//     flyTo, pass-through for flyThrough). Gated on 'fly' in the character's modes.
//   • CROSS-SURFACE — a target on another surface routes via the page traversal graph
//     (Dijkstra over the typed walk/hop/jump/fly edges), each leg run in its mode.
//
// Everything is deterministic + DOM-free; motion is px, +y DOWN, impulses px/s.

import type { CharacterDoc, Intent, MovementVerb, RigTemplate } from '@dash/schema'
import { parseTargetRef } from '@dash/schema'
import type { Blender } from './blender'
import type { Clip, Pose } from '@dash/schema'
import { STEP_MS } from './loop'
import type { EventBus } from './events'
import { createGait, type Gait } from './gait'
import type { MutableWorld } from './world/holes'
import type { CollisionWorld, Capsule, SegmentRef } from './world/collision'
import { sweptCapsuleVsSegments, stopAt } from './world/collision'
import type { TraversalGraph, TravNode } from './world/traversal'

// ── milestone event vocabulary (7b's cue scheduler anchors to these; keep exact) ──
export const LOCO_EVENTS = {
  start: 'intent:start',
  arrived: 'intent:arrived',
  blocked: 'intent:blocked',
  failed: 'intent:failed',
  jumpLaunch: 'jump:launch',
  jumpLand: 'jump:land',
  route: 'path:route',
  leg: 'path:leg',
} as const

// ── tunables (documented design decisions) ────────────────────────────────────
const DT = STEP_MS / 1000
/** Ballistic gravity, px/s², +y DOWN — matches the world/verlet constant. */
export const LOCO_GRAVITY = 1600
/** Neutral ground speed (px/s); scaled by personality energy. */
const BASE_WALK_SPEED = 90
/** Arrival tolerance for ground/leg completion (px). */
const ARRIVE_TOL_PX = 4
/** Max floor-height difference a single ground leg may span (walk-crouch + bob slack). */
const GROUND_STEP_TOL = 12
/** Fly arrival: begin slowing within this radius (flyTo only), complete within tol. */
const FLY_SLOW_RADIUS = 60
const FLY_ARRIVE_TOL = 6
/** flyThrough waypoint pass tolerance (no slowdown). */
const FLY_THROUGH_TOL = 14
/** Settle window after a jump landing before `arrived` (ms). */
const JUMP_SETTLE_MS = 180
/** A jump/hop leg counts as executable/landed only within this distance of its aim
 * point (px, hip-to-hip) — both for plan-time edge pruning and the post-landing
 * miss check. */
const JUMP_LAND_TOL = 24
/** Minimum floaty apex above launch for a flat jump (px), capped by maxJumpHeight. */
const JUMP_REST_ARC = 42
/** stopAt skin so a blocked capsule rests just outside the wall (no re-penetration). */
const CAP_SKIN = 0.5
/** Motion-into-wall dot threshold (px²/tick) below which a hit is a slide, not a block. */
const INTO_WALL_EPS = 1e-4
/** The marker name a jump clip must carry at its launch frame. */
export const LAUNCH_MARKER = 'launch'
/** Anticipation deadline margin past the clip's launch-marker time (ms): the marker
 * MUST fire within marker.t of starting the clip; the margin absorbs blend startup.
 * Missing it means the wait was wedged — fail loudly, never hang. */
const LAUNCH_DEADLINE_MARGIN_MS = 500
/** Airborne deadline: 2× the solved flight time + this margin (ms). A jump that has
 * not landed by then lost its landing surface (cut mid-flight) → `no-landing`. */
const AIR_DEADLINE_MARGIN_MS = 750
/** Out-of-bounds floor: this far below the lowest collision segment = no-landing. */
const OOB_MARGIN_PX = 400
/** Max route replans per intent (leg-transition revalidation) before `route-stale`. */
const MAX_REPLANS = 4

export interface CharacterTransform {
  x: number
  y: number
  rot: number
  facing: 1 | -1
}

export type LocoStatus = 'idle' | 'running' | 'arrived' | 'blocked' | 'failed'
export type LocoMode = 'idle' | 'ground' | 'jump' | 'fly'
type JumpPhase = 'anticipate' | 'air' | 'settle'

interface Leg {
  mode: Exclude<LocoMode, 'idle'>
  target: { x: number; y: number }
  nodeId?: string
  edgeType?: string
}

/** The collision segment a jump launches from (ignored while ascending so the
 * capsule can separate from its own support; everything else is a real contact). */
interface SupportRef {
  entity: string
  segIndex: number
}

/** Serializable locomotion state (plain JSON). Gait is reconstructed from
 * {startX, speed, dir, floorY, elapsedMs} — gait phase/rootX accumulate LINEARLY so
 * one big advance == many small ones, making snapshot/restore exact. */
export interface LocomotionState {
  mode: LocoMode
  status: LocoStatus
  verb: MovementVerb | null
  legs: Leg[]
  legIndex: number
  /** The intent's original TargetRef — re-resolved on leg-transition replans. */
  pendingRef: string | null
  replanCount: number
  // ground
  gStartX: number
  gSpeed: number
  gDir: 1 | -1
  gFloorY: number
  gHipHeight: number
  gElapsedMs: number
  // jump
  jPhase: JumpPhase
  jVx: number
  jVy: number
  jSettleMs: number
  jLaunched: boolean
  jClipId: string | null
  jAnticipateMs: number
  jMaxAnticipateMs: number
  jAirMs: number
  jMaxAirMs: number
  jFloorBound: number
  jSupport: SupportRef | null
  // fly
  fTarget: { x: number; y: number }
  // per-intent timeout accounting (7b consumes; 7a records)
  elapsedMs: number
  /** Contextual travel binding for travel:* refs (P9). */
  travelCtx: { from?: string; to?: string } | null
}

export interface LocomotionDeps {
  rig: RigTemplate
  character: CharacterDoc
  world: MutableWorld
  blender: Blender
  events: EventBus
  characterId: string
  /** Named clips available for authored feel (jump, jumpLand, walk, idle, ...). */
  clips: Record<string, Clip>
  /** Named poses (idle fallback, tuck, ...). */
  poses: Record<string, Pose>
  /** Conventional clip/pose names the solver uses. */
  names?: {
    idle?: string
    walk?: string
    jump?: string
    jumpLand?: string
    tuck?: string
    fly?: string
  }
  /** The character transform, mutated in place by the solver. */
  transform: CharacterTransform
  /** Current world capsule for the character (recomputed from transform). */
  capsule(): Capsule
  /** Hip height above the floor at rest (from rig sizing). */
  hipHeight: number
}

export interface Locomotion {
  /** Start a movement intent. Resolves the target, plans a route if cross-surface. */
  begin(intent: Intent & { verb: MovementVerb }): void
  /** Bind/unbind the from/to panels a travel run resolves travel:* refs against. */
  setTravelContext(ctx: { from?: string; to?: string } | null): void
  /** Runs BEFORE blender.tick(): advance gait/steer, set the blender base source,
   * commit ground/fly motion + collision. Movement that needs markers waits. */
  preBlend(): void
  /** Runs AFTER blender.tick(): consume clip markers (jump launch sync), integrate
   * ballistics + collision, emit landing/arrival. */
  postBlend(markers: readonly string[]): void
  readonly status: LocoStatus
  readonly mode: LocoMode
  reset(): void
  getState(): LocomotionState
  setState(s: LocomotionState): void
}

// ── pure ballistics (exported so the negative-control test can launch WITHOUT the
//    marker sync and prove the launch tick differs) ─────────────────────────────

export interface BallisticSolution {
  vx: number
  vy: number
  /** peak height above launch (px, >0 = up). */
  apex: number
  /** flight time (s). */
  flightTime: number
}

/** Solve a jump arc from `from` to `to` under LOCO_GRAVITY, obeying caps. Returns
 * null if unreachable (target higher than maxJumpHeight, or farther than
 * maxJumpDistance). Chooses a floaty apex: max(needed clearance, JUMP_REST_ARC),
 * capped by maxJumpHeight. */
export function solveBallistic(
  from: { x: number; y: number },
  to: { x: number; y: number },
  caps: { maxJumpHeight?: number; maxJumpDistance?: number },
  g = LOCO_GRAVITY,
): BallisticSolution | null {
  const dx = to.x - from.x
  const dy = to.y - from.y // +y DOWN → dy<0 means target is HIGHER
  const maxH = caps.maxJumpHeight ?? 120
  const maxD = caps.maxJumpDistance ?? 180
  const rise = -dy // >0 if target above launch
  if (rise > maxH + 1e-6) return null // can't reach that height
  if (Math.abs(dx) > maxD + 1e-6) return null // too far horizontally
  // apex above launch: enough to clear the target's rise, plus a floaty minimum.
  const apex = Math.min(maxH, Math.max(JUMP_REST_ARC, rise + JUMP_REST_ARC * 0.5))
  const vy = -Math.sqrt(2 * g * apex) // upward (negative)
  // dy = vy*T + 0.5 g T²  → later positive root
  const disc = vy * vy + 2 * g * dy
  if (disc < 0) return null // apex too low to reach target (shouldn't happen given rise≤apex)
  const T = (-vy + Math.sqrt(disc)) / g
  if (!(T > 0)) return null
  const vx = dx / T
  return { vx, vy, apex, flightTime: T }
}

// ── Dijkstra over the typed traversal edges (deterministic tie-break) ──────────────
// DESIGN: unweighted-ish Dijkstra with edge cost = euclidean `dist`; ties broken by
// ascending accumulated cost then ascending node id (string compare) — fully
// deterministic. Kept simple (small graphs: 3 nodes/panel) per the plan.
// `allow` filters edge TYPES: ground verbs (moveTo/jumpTo) route over walk/hop/jump
// edges ONLY (plan §7a: "path of walk/hop/jump edges") — a character whose caps
// include fly still WALKS a moveTo; fly edges are for the fly verbs' future routing.
function shortestPath(
  graph: TraversalGraph,
  fromId: string,
  toId: string,
  allow?: ReadonlySet<string>,
): TravNode[] | null {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  if (!nodeById.has(fromId) || !nodeById.has(toId)) return null
  const adj = new Map<string, { to: string; cost: number; type: string }[]>()
  for (const n of graph.nodes) adj.set(n.id, [])
  for (const e of graph.edges) {
    if (allow && !allow.has(e.type)) continue
    adj.get(e.from)?.push({ to: e.to, cost: e.dist, type: e.type })
  }

  const dist = new Map<string, number>()
  const prev = new Map<string, { id: string; type: string }>()
  dist.set(fromId, 0)
  const visited = new Set<string>()

  while (visited.size < graph.nodes.length) {
    // pick the unvisited node with least dist; tie-break by id.
    let cur: string | null = null
    let best = Infinity
    for (const [id, d] of dist) {
      if (visited.has(id)) continue
      if (d < best - 1e-9 || (Math.abs(d - best) <= 1e-9 && cur !== null && id < cur)) {
        best = d
        cur = id
      }
    }
    if (cur === null) break
    if (cur === toId) break
    visited.add(cur)
    // deterministic neighbour order
    const nbrs = (adj.get(cur) ?? []).slice().sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
    for (const e of nbrs) {
      if (visited.has(e.to)) continue
      const nd = best + e.cost
      if (nd < (dist.get(e.to) ?? Infinity) - 1e-9) {
        dist.set(e.to, nd)
        prev.set(e.to, { id: cur, type: e.type })
      }
    }
  }
  if (!dist.has(toId)) return null
  // reconstruct
  const path: TravNode[] = []
  let at: string | undefined = toId
  const edgeTypeInto = new Map<string, string>()
  while (at !== undefined) {
    const node = nodeById.get(at)!
    path.push(node)
    const p = prev.get(at)
    if (p) edgeTypeInto.set(p.id + '>' + at, p.type)
    at = p?.id
  }
  path.reverse()
  // annotate: store edge types on nodes via a side map is awkward; caller re-derives.
  ;(path as TravNode[] & { __edgeTypes?: Map<string, string> }).__edgeTypes = edgeTypeInto
  return path
}

function nearestNode(graph: TraversalGraph, x: number, y: number, filter?: (n: TravNode) => boolean): TravNode | null {
  let best: TravNode | null = null
  let bestD = Infinity
  for (const n of graph.nodes) {
    if (filter && !filter(n)) continue
    const d = (n.x - x) ** 2 + (n.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

export function createLocomotion(deps: LocomotionDeps): Locomotion {
  const { rig, character, world, blender, events, characterId } = deps
  const caps = character.locomotion
  const names = deps.names ?? {}
  const idleName = names.idle ?? 'idle'
  const jumpName = names.jump ?? 'jump'
  const jumpLandName = names.jumpLand ?? 'jumpLand'
  const tuckName = names.tuck ?? 'tuck'

  const walkSpeed = BASE_WALK_SPEED * (0.6 + 0.8 * character.personality.energy)

  let mode: LocoMode = 'idle'
  let status: LocoStatus = 'idle'
  let verb: MovementVerb | null = null
  let legs: Leg[] = []
  let legIndex = 0
  let pendingRef: string | null = null
  let replanCount = 0
  let elapsedMs = 0

  // ground
  let gait: Gait | null = null
  /** Contextual travel binding (travel:to# / travel:from# refs). Serialized. */
  let travelCtx: { from?: string; to?: string } | null = null
  let gStartX = 0
  let gSpeed = 0
  let gDir: 1 | -1 = 1
  let gFloorY = 0
  let gHipHeight = deps.hipHeight
  let gElapsedMs = 0

  // jump
  let jPhase: JumpPhase = 'anticipate'
  let jVx = 0
  let jVy = 0
  let jSettleMs = 0
  let jLaunched = false
  let jClipId: string | null = null
  let jAnticipateMs = 0
  let jMaxAnticipateMs = 0
  let jAirMs = 0
  let jMaxAirMs = 0
  let jFloorBound = 0
  let jSupport: SupportRef | null = null

  // fly
  let fTarget = { x: 0, y: 0 }

  const t = deps.transform

  function emit(type: string, extra: Record<string, unknown> = {}): void {
    events.emit(type, { characterId, ...extra })
  }

  function idleSource(): Pose | Clip {
    return deps.clips[idleName] ?? deps.poses[idleName] ?? { id: '__idle', angles: {} }
  }

  function setBlenderAngles(angles: Record<string, number>, durationMs = 1): void {
    // Feed the gait ANGLES only (root stripped): the character transform is
    // authoritative for world placement, so the blender de-jitters angles + layers
    // additives while the solver owns the root. durationMs≈1 pins the blender to its
    // steady tracking smoothTime (gait wiring note).
    blender.setSource({ id: '__gait', angles }, { durationMs })
  }

  // ── target resolution against the LIVE world ──────────────────────────────────
  function resolveTarget(ref: string): { x: number; y: number } | null {
    const parsed = parseTargetRef(ref)
    if (!parsed) return null
    const cw: CollisionWorld = world.collision()
    if (parsed.kind === 'travel') {
      // Contextual travel ref (P9 TargetRef extension): the from/to panels are
      // bound by setTravelContext for the duration of a travel run — the v1 cue
      // compiler's context, made data. Unbound → unresolvable (intent fails loudly).
      const entity = parsed.which === 'to' ? travelCtx?.to : travelCtx?.from
      if (!entity) return null
      const panel = cw.panels.find((p) => p.entity === entity)
      if (!panel) return null
      const spots = panel.geom.spots as Record<string, { x: number; y: number }>
      const spot = spots[parsed.spot] ?? spots.interior
      return spot ? { ...spot } : null
    }
    if (parsed.kind === 'panelSpot') {
      const panel = cw.panels.find((p) => p.entity === parsed.panel)
      if (!panel) return null
      return parsed.spot === 'roof' ? { ...panel.geom.spots.roof } : { ...panel.geom.spots.interior }
    }
    if (parsed.kind === 'entity') {
      const doc = world.doc()
      const e = doc.entities.find((en) => en.id === parsed.entity)
      const tr = e?.components.transform
      return tr ? { x: tr.x, y: tr.y } : null
    }
    if (parsed.kind === 'nearestSurface') {
      // nearest standable spot: use the traversal graph node nearest the character.
      const g = safeGraph()
      const n = g ? nearestNode(g, t.x, t.y) : null
      return n ? { x: n.x, y: n.y } : null
    }
    if (parsed.kind === 'node') {
      const g = safeGraph()
      const n = g?.nodes.find((nd) => nd.id === parsed.node)
      return n ? { x: n.x, y: n.y } : null
    }
    return null
  }

  function safeGraph(): TraversalGraph | null {
    try {
      return world.traversal()
    } catch {
      return null
    }
  }

  function allSegs(): readonly SegmentRef[] {
    return world.collision().segments
  }

  // ── route planning ────────────────────────────────────────────────────────────
  /** Ground verbs route over walk/hop/jump edges ONLY (plan §7a) — fly caps flood the
   * graph with fly edges, and a moveTo that rode one wouldn't be a walk. The set is
   * further gated by the character's OWN modes (capability model, documented):
   *   'walk' → walk edges (and the moveTo verb itself)
   *   'hop'  → hop AND jump edges (both execute ballistically, bounded by the
   *            maxJumpHeight/maxJumpDistance caps; and the jumpTo verb itself)
   *   'fly'  → the fly verbs (flyTo/flyThrough); fly edges are reserved for future
   *            fly routing — 7a fly verbs steer free-space. */
  const GROUND_EDGES: ReadonlySet<string> = new Set([
    ...(caps.modes.includes('walk') ? ['walk'] : []),
    ...(caps.modes.includes('hop') ? ['hop', 'jump'] : []),
  ])

  /** A capsule translated to an arbitrary hip position (the live capsule's shape). */
  function capAt(x: number, y: number): Capsule {
    const c = deps.capsule()
    return { x0: c.x0 + (x - t.x), y0: c.y0 + (y - t.y), x1: c.x1 + (x - t.x), y1: c.y1 + (y - t.y), r: c.r }
  }

  /** The collision segment supporting a hip position (swept a short probe down).
   * Recorded at launch; ignored while ASCENDING so the capsule can separate from its
   * own support — every other airborne contact is real (blocked). */
  function supportUnder(x: number, y: number): SupportRef | null {
    const hit = sweptCapsuleVsSegments(capAt(x, y), 0, 4, allSegs())
    return hit ? { entity: hit.entity, segIndex: hit.segIndex } : null
  }

  /** Simulate a ballistic hop/jump arc with EXACTLY the executor's air rules
   * (postBlend): contacts with the LAUNCH SUPPORT are ignored while ascending (the
   * capsule separating from its own floor); a descending floor hit is the landing;
   * ANY other contact — wall, ceiling/underside, foreign floor while ascending — is
   * a blocking impact (arc fails). Returns the landing hip point, or null if the
   * arc blocks or never lands within a bounded time. Used to PRUNE inexecutable
   * jump/hop edges at plan time — the 6a graph computes reachability from caps
   * alone (no clearance) — and to dry-run direct jumpTo legs (the analytic solve
   * and the discrete integrator disagree at cap boundaries; the dry-run is the
   * single source of truth for "executable"). Deterministic, plan-time only. */
  function simulateArc(fromAim: { x: number; y: number }, toAim: { x: number; y: number }): { x: number; y: number } | null {
    const sol = solveBallistic(fromAim, toAim, caps)
    if (!sol) return null
    const segs = allSegs()
    const support = supportUnder(fromAim.x, fromAim.y)
    let x = fromAim.x
    let y = fromAim.y
    const vx = sol.vx
    let vy = sol.vy
    const maxTicks = Math.ceil(((sol.flightTime * 2) * 1000 + AIR_DEADLINE_MARGIN_MS) / STEP_MS)
    for (let i = 0; i < maxTicks; i++) {
      vy += LOCO_GRAVITY * DT
      const dx = vx * DT
      const dy = vy * DT
      const hit = sweptCapsuleVsSegments(capAt(x, y), dx, dy, segs)
      if (hit) {
        const isSupport = support !== null && hit.entity === support.entity && hit.segIndex === support.segIndex
        if (vy < 0 && isSupport) {
          // separating from the launch floor — integrate through.
        } else if (hit.ny < -0.5 && vy > 0) {
          const p = stopAt(x, y, x + dx, y + dy, hit.t, CAP_SKIN)
          return { x: p.x, y: p.y } // landing
        } else {
          return null // airborne impact (wall/ceiling/foreign floor) — arc blocks
        }
      }
      x += dx
      y += dy
    }
    return null
  }

  /** A hop/jump edge is executable iff its simulated arc lands within tolerance of
   * the destination node's hip aim point. */
  function jumpEdgeFeasible(from: TravNode, to: TravNode): boolean {
    const aimFrom = { x: from.x, y: from.y - deps.hipHeight }
    const aimTo = { x: to.x, y: to.y - deps.hipHeight }
    const land = simulateArc(aimFrom, aimTo)
    if (!land) return false
    return Math.hypot(land.x - aimTo.x, land.y - aimTo.y) <= JUMP_LAND_TOL
  }

  /** A direct jump from the character's CURRENT hip is executable (dry-run). */
  function directJumpFeasible(to: { x: number; y: number }): boolean {
    const aim = jumpAim(to)
    const land = simulateArc({ x: t.x, y: t.y }, aim)
    if (!land) return false
    return Math.hypot(land.x - aim.x, land.y - aim.y) <= JUMP_LAND_TOL
  }

  function planRoute(to: { x: number; y: number }, moveVerb: MovementVerb): Leg[] | null {
    const g = safeGraph()
    if (!g) return null
    const start = nearestNode(g, t.x, t.y)
    const goal = nearestNode(g, to.x, to.y)
    if (!start || !goal) return null
    const grounded = moveVerb === 'moveTo' || moveVerb === 'jumpTo'
    const allow = grounded ? GROUND_EDGES : undefined
    // Prune inexecutable hop/jump edges (arc dry-run) before routing ground verbs.
    let graph = g
    if (grounded) {
      const nodeById = new Map(g.nodes.map((n) => [n.id, n]))
      const feasible = new Map<string, boolean>()
      const edges = g.edges.filter((e) => {
        if (e.type !== 'hop' && e.type !== 'jump') return true
        const key = e.from + '>' + e.to
        let ok = feasible.get(key)
        if (ok === undefined) {
          const a = nodeById.get(e.from)
          const b = nodeById.get(e.to)
          ok = a !== undefined && b !== undefined && jumpEdgeFeasible(a, b)
          feasible.set(key, ok)
        }
        return ok
      })
      graph = { ...g, edges }
    }
    const path = shortestPath(graph, start.id, goal.id, allow)
    if (!path || path.length === 0) return null
    const edgeTypes = (path as TravNode[] & { __edgeTypes?: Map<string, string> }).__edgeTypes
    const out: Leg[] = []
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1]
      const node = path[i]
      const type = edgeTypes?.get(from.id + '>' + node.id) ?? 'walk'
      const legMode: Exclude<LocoMode, 'idle'> = type === 'fly' ? 'fly' : type === 'walk' ? 'ground' : 'jump'
      out.push({ mode: legMode, target: { x: node.x, y: node.y }, nodeId: node.id, edgeType: type })
    }
    // final hop from the goal node to the exact target point (short ground/fly step).
    const goalDist = Math.hypot(to.x - goal.x, to.y - goal.y)
    if (goalDist > ARRIVE_TOL_PX) {
      const finalMode: Exclude<LocoMode, 'idle'> = moveVerb === 'flyTo' || moveVerb === 'flyThrough' ? 'fly' : 'ground'
      out.push({ mode: finalMode, target: { x: to.x, y: to.y } })
    }
    return out.length > 0 ? out : [{ mode: moveVerb === 'jumpTo' ? 'jump' : 'ground', target: to }]
  }

  /** Is the straight ground path from the character to `to` clear of blocking walls? */
  function directGroundClear(to: { x: number; y: number }): boolean {
    const dx = to.x - t.x
    const dy = to.y - t.y
    const hit = sweptCapsuleVsSegments(deps.capsule(), dx, dy, allSegs())
    if (!hit) return true
    return dx * hit.nx + dy * hit.ny >= -INTO_WALL_EPS // a slide, not a block
  }

  // ── leg execution setup ───────────────────────────────────────────────────────
  function startLeg(): void {
    const leg = legs[legIndex]
    if (!leg) {
      finishArrived()
      return
    }
    mode = leg.mode
    if (leg.edgeType) emit(LOCO_EVENTS.leg, { legIndex, edgeType: leg.edgeType, target: leg.target })
    if (leg.mode === 'ground') startGround(leg.target)
    else if (leg.mode === 'jump') startJump(leg.target)
    else startFly(leg.target)
  }

  function startGround(to: { x: number; y: number }): void {
    // A ground leg ADOPTS the target's floor line (the authoring convention: place
    // a character loosely, the engine stands it on the line it walks). Adoption is
    // a real vertical motion, so it is SWEPT: stepping down/up onto a line that
    // requires passing through geometry (e.g. a panel between here and a floor
    // 300px below) blocks loudly instead of riding fantasy edges. Pre-charm this
    // sweep existed only by accident inside the first gait tick; now it is the
    // deliberate leg-start contract. Feet = the physical capsule bottom.
    const cap = deps.capsule()
    const feetY = cap.y1 + cap.r
    const adoptDy = to.y - feetY
    if (Math.abs(adoptDy) > GROUND_STEP_TOL) {
      const hit = sweptCapsuleVsSegments(cap, 0, adoptDy, allSegs())
      if (hit && adoptDy * hit.ny < -INTO_WALL_EPS) {
        blockAt(t.x, t.y, hit, { reason: 'ground-unreachable' })
        return
      }
    }
    gFloorY = to.y
    gHipHeight = deps.hipHeight
    gStartX = t.x
    gDir = to.x >= t.x ? 1 : -1
    gSpeed = walkSpeed * gDir
    gElapsedMs = 0
    t.facing = gDir
    gait = createGait(rig, character, {
      floorY: () => gFloorY,
      speed: gSpeed,
      startX: gStartX,
      direction: gDir,
      hipHeight: gHipHeight,
    })
    // remember the goal x for arrival
    legs[legIndex] = { ...legs[legIndex], target: to }
  }

  /** The hip aim point for a surface target: the character stands hipHeight above the
   * floor, so aim the hip there (else the feet land short/low). */
  function jumpAim(to: { x: number; y: number }): { x: number; y: number } {
    return { x: to.x, y: to.y - deps.hipHeight }
  }

  /** Fail the current intent loudly and return to idle — the single "never wedge"
   * exit: every wait in the solver is bounded and lands here on expiry. */
  function failLoco(reason: string, extra: Record<string, unknown> = {}): void {
    status = 'failed'
    mode = 'idle'
    blender.setSource(idleSource(), { durationMs: 150 })
    emit(LOCO_EVENTS.failed, { verb, reason, ...extra })
  }

  function startJump(to: { x: number; y: number }): void {
    const sol = solveBallistic(t, jumpAim(to), caps)
    if (!sol) {
      failLoco('unreachable-jump', { target: to })
      return
    }
    // AUTHORED-CLIP CONTRACT (validated BEFORE entering anticipation — an invalid
    // clip must fail the intent immediately, never leave a marker wait that can't
    // fire): the jump clip must exist and carry a 'launch' marker at t > 0 (a t=0
    // marker is never crossed INTO — see clip.ts markersCrossed).
    const jc = deps.clips[jumpName]
    const marker = jc?.markers?.find((m) => m.event === LAUNCH_MARKER && m.t > 0)
    if (!jc || !marker) {
      failLoco('no-launch-clip', { clip: jumpName })
      return
    }
    jPhase = 'anticipate'
    jLaunched = false
    jVx = sol.vx
    jVy = sol.vy
    jSettleMs = 0
    jClipId = jc.id
    jAnticipateMs = 0
    jMaxAnticipateMs = marker.t + LAUNCH_DEADLINE_MARGIN_MS
    jAirMs = 0
    jMaxAirMs = sol.flightTime * 2 * 1000 + AIR_DEADLINE_MARGIN_MS
    // out-of-bounds floor: below every collision segment by a margin = no world left
    // to land on (the landing surface was cut mid-flight).
    let maxSegY = t.y
    for (const s of allSegs()) maxSegY = Math.max(maxSegY, s.seg.y1, s.seg.y2)
    jFloorBound = maxSegY + OOB_MARGIN_PX
    // the launch support segment — ignored while ascending, so the capsule can
    // separate from its own floor (everything else airborne is a real contact).
    jSupport = supportUnder(t.x, t.y)
    t.facing = to.x >= t.x ? 1 : -1
    // play the anticipation clip; launch is synced to its `launch` marker.
    blender.setSource(jc, { durationMs: 120 })
    legs[legIndex] = { ...legs[legIndex], target: to }
  }

  function startFly(to: { x: number; y: number }): void {
    if (!caps.modes.includes('fly')) {
      status = 'failed'
      emit(LOCO_EVENTS.failed, { verb, reason: 'cannot-fly', target: to })
      return
    }
    fTarget = { x: to.x, y: to.y }
    const fc = deps.clips[names.fly ?? 'fly']
    if (fc) blender.setSource(fc, { durationMs: 150 })
    legs[legIndex] = { ...legs[legIndex], target: to }
  }

  function advanceLegOrFinish(): void {
    legIndex++
    if (legIndex >= legs.length) {
      finishArrived()
      return
    }
    // LEG-TRANSITION REVALIDATION: the route was planned against the world at
    // begin(); a cut/heal since then can invalidate the NEXT leg (a healed wall
    // reappears in a hop's arc; a cut removes a walk floor). Re-check the leg we are
    // about to execute against the LIVE world; if stale, replan from the current
    // position toward the intent's original TargetRef (bounded — never a loop).
    const next = legs[legIndex]
    const stale =
      next.mode === 'jump'
        ? !directJumpFeasible(next.target)
        : next.mode === 'ground'
          ? !directGroundClear(next.target)
          : false // fly legs sweep every tick — no plan-time promise to revalidate
    if (stale) {
      if (replanCount >= MAX_REPLANS || pendingRef === null) {
        failLoco('route-stale', { legIndex })
        return
      }
      replanCount++
      const to = resolveTarget(pendingRef)
      if (!to) {
        failLoco('unresolvable-target', { target: pendingRef })
        return
      }
      const route = planRoute(to, verb ?? 'moveTo')
      if (!route || route.length === 0) {
        failLoco('route-stale', { legIndex })
        return
      }
      legs = route
      legIndex = 0
      emit(LOCO_EVENTS.route, { legs: route.map((l) => ({ mode: l.mode, edgeType: l.edgeType })), replanned: true })
    }
    startLeg()
  }

  function finishArrived(): void {
    status = 'arrived'
    mode = 'idle'
    blender.setSource(idleSource(), { durationMs: 200 }) // velocity-continuous handoff
    emit(LOCO_EVENTS.arrived, { verb })
  }

  function blockAt(
    px: number,
    py: number,
    hit: { nx: number; ny: number; entity: string; segIndex: number },
    extra: Record<string, unknown> = {},
  ): void {
    t.x = px
    t.y = py
    status = 'blocked'
    mode = 'idle'
    blender.setSource(idleSource(), { durationMs: 120 })
    emit(LOCO_EVENTS.blocked, { verb, x: px, y: py, entity: hit.entity, segIndex: hit.segIndex, nx: hit.nx, ny: hit.ny, ...extra })
  }

  // ── public: begin ──────────────────────────────────────────────────────────────
  function begin(intent: Intent & { verb: MovementVerb }): void {
    verb = intent.verb
    status = 'running'
    legIndex = 0
    pendingRef = intent.target
    replanCount = 0
    elapsedMs = 0

    // CAPABILITY GATING (model documented at GROUND_EDGES): each verb requires its
    // mode — a fly-only bird cannot walk/jump; a walker cannot fly.
    if (intent.verb === 'moveTo' && !caps.modes.includes('walk')) {
      failLoco('cannot-walk', { target: intent.target })
      return
    }
    if (intent.verb === 'jumpTo' && !caps.modes.includes('hop')) {
      failLoco('cannot-jump', { target: intent.target })
      return
    }
    if ((intent.verb === 'flyTo' || intent.verb === 'flyThrough') && !caps.modes.includes('fly')) {
      failLoco('cannot-fly', { target: intent.target })
      return
    }

    const to = resolveTarget(intent.target)
    if (!to) {
      failLoco('unresolvable-target', { target: intent.target })
      return
    }
    emit(LOCO_EVENTS.start, { verb, target: intent.target, to })

    if (intent.verb === 'flyTo' || intent.verb === 'flyThrough') {
      // fly ignores the graph — free-space steering to the point (swept; panels
      // block fliers).
      legs = [{ mode: 'fly', target: to }]
      startLeg()
      return
    }

    if (intent.verb === 'moveTo') {
      // 1) direct ground path clear → single leg.
      // 2) blocked, but the character is on an OPEN surface → route via the graph
      //    (over the roof via hop/jump edges — the "route through a wall requires the
      //    graph" case).
      // 3) blocked AND the character is ENCLOSED (trapped in a fully-walled panel) →
      //    a direct leg anyway, so it WALKS INTO the wall and rests there (the Wall
      //    Test blocked primitive). An enclosed character can't route out; routing is
      //    only for open characters going around obstacles. This split keeps the Wall
      //    Test deterministic even though 6a jump edges skip wall-clearance checks.
      if (directGroundClear(to)) {
        legs = [{ mode: 'ground', target: to }]
        startLeg()
        return
      }
      if (!world.isEnclosed(t.x, t.y)) {
        const route = planRoute(to, intent.verb)
        if (route && route.length > 0) {
          legs = route
          emit(LOCO_EVENTS.route, { legs: route.map((l) => ({ mode: l.mode, edgeType: l.edgeType })) })
          startLeg()
          return
        }
      }
      legs = [{ mode: 'ground', target: to }]
      startLeg()
      return
    }

    // jumpTo: direct ballistic if EXECUTABLE (dry-run — the analytic solve and the
    // discrete integrator disagree at cap boundaries, so simulateArc is the single
    // source of truth); else route via graph; else fail.
    if (intent.verb === 'jumpTo') {
      if (directJumpFeasible(to)) {
        legs = [{ mode: 'jump', target: to }]
        startLeg()
        return
      }
      const route = planRoute(to, intent.verb)
      if (!route) {
        failLoco('no-route', { target: intent.target })
        return
      }
      legs = route
      emit(LOCO_EVENTS.route, { legs: route.map((l) => ({ mode: l.mode, edgeType: l.edgeType })) })
      startLeg()
      return
    }
  }

  // ── public: preBlend (ground + fly advance; jump anticipation holds) ──────────────
  function preBlend(): void {
    if (status !== 'running') return
    elapsedMs += STEP_MS
    if (mode === 'ground') preGround()
    else if (mode === 'fly') preFly()
    // jump: nothing pre-blend (anticipation clip plays; launch handled post-blend).
  }

  function preGround(): void {
    if (!gait) return
    const before = t.x
    const frame = gait.update(STEP_MS)
    gElapsedMs += STEP_MS
    const nextX = frame.pose.root.x
    const nextY = frame.pose.root.y
    const dx = nextX - before
    // Swept capsule for this step; block only on motion INTO a wall. HORIZONTAL
    // component only: ground gait follows the support's floorY by construction
    // (including the walk-crouch easing the hip down), and sweeping that vertical
    // follow reads the character's OWN support as a wall — the tick-one self-block
    // the charm round uncovered. Vertical hazards (drop-offs, healed floors) are
    // the leg re-validation's job, not the wall sweep's.
    const hit = sweptCapsuleVsSegments(deps.capsule(), dx, 0, allSegs())
    if (hit && dx * hit.nx < -INTO_WALL_EPS) {
      const p = stopAt(before, t.y, before + dx, t.y, hit.t, CAP_SKIN)
      blockAt(p.x, p.y, hit)
      return
    }
    t.x = nextX
    t.y = nextY
    t.rot = frame.pose.root.rot
    // arrival: reached or passed the goal x. The goal is a SURFACE point (feet);
    // the transform is the HIP, which stands gHipHeight above the walking line —
    // snapping the hip to the surface would sink the character into the floor.
    const goal = legs[legIndex].target
    const remaining = (goal.x - t.x) * gDir
    if (remaining <= ARRIVE_TOL_PX) {
      t.x = goal.x
      t.y = goal.y - gHipHeight
      advanceLegOrFinish()
      return
    }
    setBlenderAngles(frame.pose.angles)
  }

  function preFly(): void {
    const dx = fTarget.x - t.x
    const dy = fTarget.y - t.y
    const dist = Math.hypot(dx, dy)
    const leg = legs[legIndex]
    const isThrough = verb === 'flyThrough' && leg.mode === 'fly' && legIndex === legs.length - 1
    const tol = isThrough ? FLY_THROUGH_TOL : FLY_ARRIVE_TOL
    if (dist <= tol) {
      advanceLegOrFinish()
      return
    }
    const flySpeed = caps.flySpeed ?? 160
    let speed = flySpeed
    if (!isThrough && dist < FLY_SLOW_RADIUS) speed = flySpeed * (dist / FLY_SLOW_RADIUS)
    const ux = dx / (dist || 1)
    const uy = dy / (dist || 1)
    // Step is CLAMPED to the remaining distance: an extreme flySpeed must land ON
    // the waypoint this tick, never oscillate past it.
    const step = Math.min(speed * DT, dist)
    const mx = ux * step
    const my = uy * step
    // Fliers are swept like everyone else — panels block them. A waypoint inside a
    // wall is a blocked intent, not a pass-through.
    const hit = sweptCapsuleVsSegments(deps.capsule(), mx, my, allSegs())
    if (hit && mx * hit.nx + my * hit.ny < -INTO_WALL_EPS) {
      const p = stopAt(t.x, t.y, t.x + mx, t.y + my, hit.t, CAP_SKIN)
      blockAt(p.x, p.y, hit)
      return
    }
    t.x += mx
    t.y += my
    t.facing = ux >= 0 ? 1 : -1
  }

  // ── public: postBlend (jump launch sync + ballistic integration) ────────────────
  function postBlend(markers: readonly string[]): void {
    if (status !== 'running' || mode !== 'jump') return
    if (jPhase === 'anticipate') {
      // MARKER-SYNCED LAUNCH: launch exactly when the clip's `launch` marker crosses.
      // The wait is BOUND to the source: markers only count while OUR jump clip is
      // still the blender's base source (an external setSource cancels the wait —
      // fail, don't hang on a marker that can no longer fire), and BOUNDED in time
      // (marker.t + margin — a wedged wait fails loudly).
      if (markers.includes(LAUNCH_MARKER)) {
        jPhase = 'air'
        jLaunched = true
        emit(LOCO_EVENTS.jumpLaunch, { verb, vx: jVx, vy: jVy })
        const tuck = deps.clips[tuckName] ?? deps.poses[tuckName]
        if (tuck) blender.setSource(tuck as Pose | Clip, { durationMs: 90 })
        return
      }
      const src = blender.currentSource()
      if (src.kind !== 'clip' || src.id !== jClipId) {
        failLoco('launch-interrupted', { expected: jClipId, actual: src.id })
        return
      }
      jAnticipateMs += STEP_MS
      if (jAnticipateMs > jMaxAnticipateMs) {
        failLoco('launch-timeout', { clip: jClipId, waitedMs: jAnticipateMs })
      }
      return
    }
    if (jPhase === 'air') {
      // TERMINAL BOUNDS: airborne can never be an unbounded state. The deadline is
      // derived from the solved arc (2× flight time + margin); the floor bound is
      // below every collision segment. Either expiring = the landing surface is gone
      // (cut mid-flight) → intent fails, character returns to idle at its position.
      jAirMs += STEP_MS
      if (jAirMs > jMaxAirMs || t.y > jFloorBound) {
        failLoco('no-landing', { x: t.x, y: t.y, airMs: jAirMs })
        return
      }
      const before = { x: t.x, y: t.y }
      jVy += LOCO_GRAVITY * DT
      const dx = jVx * DT
      const dy = jVy * DT
      const hit = sweptCapsuleVsSegments(deps.capsule(), dx, dy, allSegs())
      if (hit) {
        const isSupport = jSupport !== null && hit.entity === jSupport.entity && hit.segIndex === jSupport.segIndex
        const p = stopAt(before.x, before.y, before.x + dx, before.y + dy, hit.t, CAP_SKIN)
        if (jVy < 0 && isSupport) {
          // separating from the launch floor while ascending — integrate through.
          // ONLY the recorded support is exempt: any other ascending contact (a
          // ceiling, a platform underside, a foreign floor) is a real collision.
        } else if (hit.ny < -0.5 && jVy > 0) {
          // LANDED: a floor hit while DESCENDING (event-driven, not precomputed).
          t.x = p.x
          t.y = p.y
          jPhase = 'settle'
          jSettleMs = 0
          emit(LOCO_EVENTS.jumpLand, { verb, x: p.x, y: p.y })
          const land = deps.clips[jumpLandName] ?? deps.poses[jumpLandName]
          if (land) blender.setSource(land as Pose | Clip, { durationMs: 60 })
          else blender.setSource(idleSource(), { durationMs: 120 })
          return
        } else {
          // AIRBORNE IMPACT (wall, ceiling, foreign floor while ascending): blocked
          // at the contact point — an event + a halted intent, never a silent slide.
          // The 7b bounce reaction will hang off this exact milestone.
          blockAt(p.x, p.y, { nx: hit.nx, ny: hit.ny, entity: hit.entity, segIndex: hit.segIndex }, { airborne: true })
          return
        }
      }
      t.x += dx
      t.y += dy
      t.facing = jVx >= 0 ? 1 : jVx < 0 ? -1 : t.facing
      return
    }
    if (jPhase === 'settle') {
      jSettleMs += STEP_MS
      if (jSettleMs >= JUMP_SETTLE_MS) {
        // LANDING-MISS CHECK: a landing far from the leg's aim point (deflected
        // mid-air, or an infeasible edge that slipped through) must FAIL LOUDLY, not
        // silently run the next leg from the wrong place. Give-up reactions are 7b;
        // 7a raises the failure event and halts.
        const goal = legs[legIndex].target
        const aim = jumpAim(goal)
        if (Math.hypot(t.x - aim.x, t.y - aim.y) > JUMP_LAND_TOL) {
          failLoco('jump-missed', { x: t.x, y: t.y, aim })
          return
        }
        advanceLegOrFinish()
      }
    }
  }

  function reset(): void {
    mode = 'idle'
    status = 'idle'
    verb = null
    legs = []
    legIndex = 0
    pendingRef = null
    replanCount = 0
    gait = null
    jPhase = 'anticipate'
    jLaunched = false
    jClipId = null
    jAnticipateMs = 0
    jMaxAnticipateMs = 0
    jAirMs = 0
    jMaxAirMs = 0
    jFloorBound = 0
    jSupport = null
    elapsedMs = 0
  }

  function getState(): LocomotionState {
    return {
      mode,
      status,
      verb,
      legs: legs.map((l) => ({ ...l, target: { ...l.target } })),
      legIndex,
      pendingRef,
      replanCount,
      gStartX,
      gSpeed,
      gDir,
      gFloorY,
      gHipHeight,
      gElapsedMs,
      jPhase,
      jVx,
      jVy,
      jSettleMs,
      jLaunched,
      jClipId,
      jAnticipateMs,
      jMaxAnticipateMs,
      jAirMs,
      jMaxAirMs,
      jFloorBound,
      jSupport: jSupport ? { ...jSupport } : null,
      fTarget: { ...fTarget },
      elapsedMs,
      travelCtx: travelCtx ? { ...travelCtx } : null,
    }
  }

  function setState(s: LocomotionState): void {
    mode = s.mode
    status = s.status
    verb = s.verb
    legs = s.legs.map((l) => ({ ...l, target: { ...l.target } }))
    legIndex = s.legIndex
    pendingRef = s.pendingRef
    replanCount = s.replanCount
    gStartX = s.gStartX
    gSpeed = s.gSpeed
    gDir = s.gDir
    gFloorY = s.gFloorY
    gHipHeight = s.gHipHeight
    gElapsedMs = s.gElapsedMs
    jPhase = s.jPhase
    jVx = s.jVx
    jVy = s.jVy
    jSettleMs = s.jSettleMs
    jLaunched = s.jLaunched
    jClipId = s.jClipId
    jAnticipateMs = s.jAnticipateMs
    jMaxAnticipateMs = s.jMaxAnticipateMs
    jAirMs = s.jAirMs
    jMaxAirMs = s.jMaxAirMs
    jFloorBound = s.jFloorBound
    jSupport = s.jSupport ? { ...s.jSupport } : null
    fTarget = { ...s.fTarget }
    elapsedMs = s.elapsedMs
    travelCtx = s.travelCtx ? { ...s.travelCtx } : null
    // Rebuild the gait deterministically: gait accumulates rootX/phase LINEARLY, so
    // recreating at gStartX and advancing by gElapsedMs in ONE step reproduces the
    // exact phase/rootX of many small steps.
    if (mode === 'ground') {
      gait = createGait(rig, character, {
        floorY: () => gFloorY,
        speed: gSpeed,
        startX: gStartX,
        direction: gDir,
        hipHeight: gHipHeight,
      })
      if (gElapsedMs > 0) gait.update(gElapsedMs)
    } else {
      gait = null
    }
  }

  return {
    begin,
    setTravelContext(ctx) {
      travelCtx = ctx ? { ...ctx } : null
    },
    preBlend,
    postBlend,
    get status() {
      return status
    },
    get mode() {
      return mode
    },
    reset,
    getState,
    setState,
  }
}
