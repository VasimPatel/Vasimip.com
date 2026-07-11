// Traversal graph (L5) — Phase 6a. Pure + deterministic (stable ordering).
//
// Auto-built from panel surfaces + a character's declared locomotion caps
// (CharacterDoc.locomotion — DATA, never P7 solver internals). Replaces the legacy
// hand-authored travel targets. Nodes are standable spots; edges are typed by how a
// character with the given caps could move between them.
//
// PAGE-SCOPED: a graph is built from ONE page's world (worldFromNotebook returns
// one WorldDocV2 per page) — pages are separate spaces; a page change is a flip
// (P7 behavior/camera), never a traversal edge. Zero inter-page edges by
// construction.
//
// Nodes per panel (stable order): interior (the authored anchor spot), roofL,
// roofR (the top-edge endpoints — two collinear nodes so a `walk` edge exists).
//
// Edge types:
//   walk — same panel, along the same continuous top edge (roofL↔roofR). Uncapped.
//   hop  — a short reach within a fraction of the jump caps (needs 'hop' mode).
//   jump — parabolic reachability within maxJumpDistance/maxJumpHeight (needs a
//          ground mode). CLEARANCE IS NOT CHECKED in 6a (a jump edge may pass over/
//          through a panel) — that interplay lands with 6b holes. Flagged.
//   fly  — any remaining pair, only if 'fly' in modes. Uncapped (steering, P7).
// Precedence walk > hop > jump > fly: the cheapest applicable type wins per pair.
//
// GROUND-PATH PRUNING: a walk or hop edge moves along/near the surface, so its
// straight path must properly cross NO wall segment on the page — an edge that
// would pass through a wall (layout overlap, or a deep interior spot behind a
// solid roof) is PRUNED, not tolerated. Proper crossing excludes collinear touches
// and shared endpoints, so a walk edge lying ON its own roof line survives. Jump
// edges keep the 6a no-clearance punt (they arc; holes/clearance land in 6b), and
// fly needs no ground path.

import type { LocomotionCaps } from '@dash/schema'
import type { CharacterDoc, WorldDocV2 } from '@dash/schema'
import { buildCollisionWorld, type CollisionWorld } from './collision'

export type EdgeType = 'walk' | 'hop' | 'jump' | 'fly'
export type NodeKind = 'interior' | 'roofL' | 'roofR'

export interface TravNode {
  id: string
  x: number
  y: number
  panel: string
  kind: NodeKind
}
export interface TravEdge {
  from: string
  to: string
  type: EdgeType
  dist: number
}
export interface TraversalGraph {
  nodes: TravNode[]
  edges: TravEdge[]
}

const HOP_DIST_FRAC = 0.4
const HOP_HEIGHT_FRAC = 0.4

function round(n: number): number {
  // Stable snapshot values (kills -0 and float dust); 1e-4 px precision.
  const r = Math.round(n * 1e4) / 1e4
  return r === 0 ? 0 : r
}

/** Proper crossing (interiors intersect, shared endpoints/collinear touch excluded). */
function properlyCross(a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px)
  const d1 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1)
  const d2 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2)
  const d3 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1)
  const d4 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Does the straight path a→b properly cross ANY wall segment on the page? */
function groundPathBlocked(a: TravNode, b: TravNode, cw: CollisionWorld): boolean {
  const line = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  for (const ref of cw.segments) if (properlyCross(line, ref.seg)) return true
  return false
}

export function buildTraversalGraph(world: WorldDocV2, character: CharacterDoc, capsOverride?: LocomotionCaps): TraversalGraph {
  const caps = capsOverride ?? character.locomotion
  const modes = new Set(caps.modes)
  const maxD = caps.maxJumpDistance ?? 0
  const maxH = caps.maxJumpHeight ?? 0
  const hopD = HOP_DIST_FRAC * maxD
  const hopH = HOP_HEIGHT_FRAC * maxH

  const cw = buildCollisionWorld(world)

  // Nodes — panels in doc order, spots in fixed order.
  const nodes: TravNode[] = []
  for (const p of cw.panels) {
    const s = p.geom.spots
    nodes.push({ id: `${p.entity}:interior`, x: round(s.interior.x), y: round(s.interior.y), panel: p.entity, kind: 'interior' })
    nodes.push({ id: `${p.entity}:roofL`, x: round(p.geom.roof.x1), y: round(p.geom.roof.y1), panel: p.entity, kind: 'roofL' })
    nodes.push({ id: `${p.entity}:roofR`, x: round(p.geom.roof.x2), y: round(p.geom.roof.y2), panel: p.entity, kind: 'roofR' })
  }

  const classify = (a: TravNode, b: TravNode): EdgeType | null => {
    if (a.panel === b.panel && a.kind !== 'interior' && b.kind !== 'interior') return 'walk'
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    const climb = a.y - b.y // SVG y-down: b higher ⇒ climb > 0
    if (modes.has('hop') && dx <= hopD && dy <= hopH) return 'hop'
    if ((modes.has('walk') || modes.has('hop')) && dx <= maxD && climb <= maxH) return 'jump'
    if (modes.has('fly')) return 'fly'
    return null
  }

  const edges: TravEdge[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue
      const a = nodes[i]
      const b = nodes[j]
      const type = classify(a, b)
      if (!type) continue
      // Ground-path pruning: walk/hop move along the surface — a wall in the way
      // kills the edge (see module header). jump/fly are exempt in 6a.
      if ((type === 'walk' || type === 'hop') && groundPathBlocked(a, b, cw)) continue
      edges.push({ from: a.id, to: b.id, type, dist: round(Math.hypot(b.x - a.x, b.y - a.y)) })
    }
  }

  return { nodes, edges }
}

// ── sanity assertions (used by the snapshot test) ────────────────────────────────

export interface SanityReport {
  ok: boolean
  problems: string[]
  panelsWithoutNode: string[]
  cappedEdgesOverLimit: number
  /** walk/hop edges whose straight path properly crosses ANY wall segment on the
   * page. buildTraversalGraph prunes these, so a valid graph reports 0. */
  groundEdgesCrossingWall: number
}

/** Assert the structural invariants a valid graph must hold, independent of the
 * committed snapshot values. walk/fly are exempt from the cap check by design;
 * jump/fly are exempt from the wall-crossing check (no-clearance punt / airborne). */
export function checkGraphSanity(graph: TraversalGraph, world: WorldDocV2, character: CharacterDoc, capsOverride?: LocomotionCaps): SanityReport {
  const caps = capsOverride ?? character.locomotion
  const maxD = caps.maxJumpDistance ?? 0
  const maxH = caps.maxJumpHeight ?? 0
  const cw = buildCollisionWorld(world)
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const problems: string[] = []

  // every panel contributes ≥1 node
  const panelsWithNode = new Set(graph.nodes.map((n) => n.panel))
  const panelsWithoutNode = cw.panels.map((p) => p.entity).filter((e) => !panelsWithNode.has(e))
  if (panelsWithoutNode.length) problems.push(`panels without a node: ${panelsWithoutNode.join(', ')}`)

  // no capped (hop/jump) edge exceeds caps
  let cappedOver = 0
  for (const e of graph.edges) {
    if (e.type === 'walk' || e.type === 'fly') continue
    const a = nodeById.get(e.from)!
    const b = nodeById.get(e.to)!
    const dx = Math.abs(b.x - a.x)
    const climb = a.y - b.y
    if (dx > maxD + 1e-6 || climb > maxH + 1e-6) cappedOver++
  }
  if (cappedOver) problems.push(`${cappedOver} hop/jump edges exceed caps`)

  // no surviving walk/hop edge crosses ANY wall segment (the builder prunes them)
  let groundCross = 0
  for (const e of graph.edges) {
    if (e.type !== 'walk' && e.type !== 'hop') continue
    const a = nodeById.get(e.from)!
    const b = nodeById.get(e.to)!
    if (groundPathBlocked(a, b, cw)) groundCross++
  }
  if (groundCross) problems.push(`${groundCross} walk/hop edges cross a wall segment`)

  return {
    ok: problems.length === 0,
    problems,
    panelsWithoutNode,
    cappedEdgesOverLimit: cappedOver,
    groundEdgesCrossingWall: groundCross,
  }
}
