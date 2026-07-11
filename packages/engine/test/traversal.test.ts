import { test, expect } from 'bun:test'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { buildTraversalGraph, checkGraphSanity, type TraversalGraph, type EdgeType } from '../src/world/traversal'
import { worldFromNotebook } from '../src/world/from-notebook'
import { panelEdges } from '../src/world/surfaces'
import type { CharacterDoc, LocomotionCaps, WorldDocV2 } from '@dash/schema'
import notebook from '../../../src/notebook/notebook.json'

// Regenerate with:  REGEN_GOLDENS=1 bun test packages/engine/test/traversal.test.ts
const REGEN = process.env.REGEN_GOLDENS === '1'
const GOLDEN = new URL('./goldens/traversal-notebook.json', import.meta.url)

const char = (caps: LocomotionCaps): CharacterDoc => ({
  id: 'test',
  rig: 'dash',
  personality: { energy: 0.5, bounciness: 0.5, confidence: 0.5, sloppiness: 0.5 },
  locomotion: caps,
})

function edgeType(g: TraversalGraph, from: string, to: string): EdgeType | null {
  const e = g.edges.find((x) => x.from === from && x.to === to)
  return e ? e.type : null
}

// ── synthetic two-panel layout with hand-computed cap boundaries ──────────────────
// maxJumpDistance=100 ⇒ hopDist=40 (0.4×). maxJumpHeight=50 ⇒ hopHeight=20.
// Panel A roofR sits at (40,200); panel B roofL sits at (40+gap, 200±rise).
function twoPanels(gap: number, rise = 0): WorldDocV2 {
  const boxA = { x: 0, y: 200, w: 40, h: 40 }
  const bx = 40 + gap
  const boxB = { x: bx, y: 200 - rise, w: 40, h: 40 }
  const mk = (id: string, box: { x: number; y: number; w: number; h: number }) => ({
    id,
    components: {
      surface: { box, anchor: { dx: box.w / 2, dy: 0 } },
      collidable: { shape: 'segments' as const, segments: panelEdges(box) },
    },
  })
  return { schemaVersion: 2, seed: 1, entities: [mk('A', boxA), mk('B', boxB)] }
}

const GROUND: LocomotionCaps = { modes: ['walk', 'hop'], maxJumpDistance: 100, maxJumpHeight: 50 }

test('walk edge exists along a panel roof and never crosses a wall', () => {
  const g = buildTraversalGraph(twoPanels(200), char(GROUND))
  expect(edgeType(g, 'A:roofL', 'A:roofR')).toBe('walk')
  const rep = checkGraphSanity(g, twoPanels(200), char(GROUND))
  expect(rep.groundEdgesCrossingWall).toBe(0)
})

test('hop↔jump cutoff at 0.4×maxJumpDistance (±ε)', () => {
  const EPS = 1e-4
  // gap so that A:roofR (40) → B:roofL (40+gap) horizontal dx = gap.
  expect(edgeType(buildTraversalGraph(twoPanels(40), char(GROUND)), 'A:roofR', 'B:roofL')).toBe('hop') // dx=40 = hopDist
  expect(edgeType(buildTraversalGraph(twoPanels(40 + EPS), char(GROUND)), 'A:roofR', 'B:roofL')).toBe('jump') // just over hop
})

test('jump cutoff at maxJumpDistance (±ε): beyond → no ground edge', () => {
  const EPS = 1e-4
  expect(edgeType(buildTraversalGraph(twoPanels(100), char(GROUND)), 'A:roofR', 'B:roofL')).toBe('jump') // dx=100 = maxD
  expect(edgeType(buildTraversalGraph(twoPanels(100 + EPS), char(GROUND)), 'A:roofR', 'B:roofL')).toBe(null) // over maxD, no fly
})

test('jump height cap: climbing beyond maxJumpHeight is unreachable', () => {
  // gap=60 (within maxD), rise so B is higher than A by `rise` (climb = rise).
  expect(edgeType(buildTraversalGraph(twoPanels(60, 50), char(GROUND)), 'A:roofR', 'B:roofL')).toBe('jump') // climb=50=maxH
  expect(edgeType(buildTraversalGraph(twoPanels(60, 50.0001), char(GROUND)), 'A:roofR', 'B:roofL')).toBe(null) // over maxH
})

test("fly mode connects any pair the ground caps leave unreachable", () => {
  const flyer = char({ modes: ['walk', 'hop', 'fly'], maxJumpDistance: 100, maxJumpHeight: 50, flySpeed: 200 })
  const w = twoPanels(400) // way beyond jump distance
  expect(edgeType(buildTraversalGraph(w, char(GROUND)), 'A:roofR', 'B:roofL')).toBe(null)
  expect(edgeType(buildTraversalGraph(w, flyer), 'A:roofR', 'B:roofL')).toBe('fly')
})

test('ground-path pruning: a hop whose straight path crosses a wall is pruned', () => {
  // A third panel wedged in the gap: its walls stand between A:roofR and B:roofL.
  const w = twoPanels(40)
  const boxC = { x: 55, y: 150, w: 10, h: 100 }
  w.entities.push({
    id: 'C',
    components: {
      surface: { box: boxC, anchor: { dx: 5, dy: 0 } },
      collidable: { shape: 'segments', segments: panelEdges(boxC) },
    },
  })
  const g = buildTraversalGraph(w, char(GROUND))
  // A:roofR (40,200) → B:roofL (80,200) crosses C's walls (x=55/65, y 150..250) → pruned.
  expect(edgeType(g, 'A:roofR', 'B:roofL')).toBe(null)
  const rep = checkGraphSanity(g, w, char(GROUND))
  expect(rep.groundEdgesCrossingWall).toBe(0) // nothing crossing survived
})

// ── PER-PAGE SNAPSHOT against the REAL notebook layout ────────────────────────────
// Pages are separate spaces (one WorldDocV2 per page; a page change is a flip, P7),
// so the graph is built per page — zero inter-page edges by construction. The
// snapshot uses Dash's GROUND caps (walk/hop/jump): his real doc also has 'fly',
// which would connect ~every same-page pair and add no regression value; the fly
// clause is covered by the focused test above.
const pageWorlds = worldFromNotebook(notebook.pages)
const dashGround = char({ modes: ['walk', 'hop'], maxJumpDistance: 180, maxJumpHeight: 120 })

test('SNAPSHOT: real notebook traversal graphs, one per page (ground caps)', () => {
  const summary = pageWorlds.map((pw) => {
    const g = buildTraversalGraph(pw.world, dashGround)
    return {
      page: pw.pageIndex,
      name: pw.name,
      nodes: g.nodes.length,
      edges: g.edges.length,
      byType: g.edges.reduce<Record<string, number>>((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {}),
      nodeIds: g.nodes.map((n) => n.id),
      edges2: g.edges.map((e) => `${e.from}->${e.to}:${e.type}`),
    }
  })
  if (REGEN) {
    writeFileSync(GOLDEN, JSON.stringify(summary, null, 2) + '\n')
    console.log('[traversal] regenerated golden')
  }
  if (!existsSync(GOLDEN)) throw new Error('missing golden traversal-notebook.json — run REGEN_GOLDENS=1')
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'))
  expect(summary).toEqual(golden)
  for (const s of summary) console.log(`[traversal snapshot] page ${s.page} (${s.name}): nodes=${s.nodes} edges=${s.edges} byType=${JSON.stringify(s.byType)}`)
})

test('every page graph passes the sanity invariants', () => {
  for (const pw of pageWorlds) {
    const g = buildTraversalGraph(pw.world, dashGround)
    const rep = checkGraphSanity(g, pw.world, dashGround)
    console.log(`[traversal sanity] page ${pw.pageIndex}: ${JSON.stringify({ panelsWithoutNode: rep.panelsWithoutNode.length, cappedOver: rep.cappedEdgesOverLimit, groundCross: rep.groundEdgesCrossingWall })}`)
    expect(rep.panelsWithoutNode).toEqual([]) // every panel ≥1 node
    expect(rep.cappedEdgesOverLimit).toBe(0) // no hop/jump exceeds caps
    expect(rep.groundEdgesCrossingWall).toBe(0) // no walk/hop crosses any wall
    expect(rep.ok).toBe(true)
  }
})

test('page scoping: 5 page worlds, 3 nodes per panel, no foreign panels in a page graph', () => {
  expect(pageWorlds).toHaveLength(5)
  const perPagePanels = [6, 2, 3, 2, 2] // notebook.json panel counts
  pageWorlds.forEach((pw, i) => {
    const g = buildTraversalGraph(pw.world, dashGround)
    expect(new Set(g.nodes.map((n) => n.panel)).size).toBe(perPagePanels[i])
    expect(g.nodes.length).toBe(perPagePanels[i] * 3)
    // every node belongs to THIS page (id carries the page index)
    for (const n of g.nodes) expect(n.panel.startsWith(`panel:${i}:`)).toBe(true)
  })
})
