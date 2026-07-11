// Dev-only Phase 6a "world" review (NOT part of the prod build — nothing in src/
// imports it). PAGE-SCOPED: pages are separate spaces (worldFromNotebook returns
// one world per page; a page change is a flip, P7) — the selector renders ONE
// page's world at a time. Three strips + a live draggable capsule:
//  • GRAPH     — the selected page's panels as outlined surfaces, traversal graph
//    overlaid (nodes as dots, edges colour-coded walk/hop/jump).
//  • COLLISION — a capsule pressed into a panel wall; the swept query's blocked
//    event + hit normal are drawn, plus the isEnclosed state of a probe point. The
//    capsule is DRAGGABLE (blocked/landed/enclosed update live).
//  • REST      — a prop bar dropped onto a panel (rests on the top edge, sleeps) and
//    a rope draped over the same panel, via the verlet collision pass.
// Served via:  bunx vite packages/renderer-svg/dev --port 5197  → /world.html
import { StrictMode, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  buildCollisionWorld,
  buildTraversalGraph,
  createVerletPanelCollider,
  createVerletWorld,
  isEnclosed,
  sweptCapsuleVsSegments,
  worldFromNotebook,
  type Capsule,
  type CollisionWorld,
} from '../../engine/src/index'
import { createPropRenderer, createRopeRenderer } from '../src/index'
import type { CharacterDoc } from '../../schema/src/index'

import notebook from '../../../src/notebook/notebook.json'

const NS = 'http://www.w3.org/2000/svg'
const VB = '0 0 960 700'
const W = 960
const H = 700

const EDGE_COLOR: Record<string, string> = { walk: '#2f9e44', hop: '#1c7ed6', jump: '#e8590c', fly: '#ae3ec9' }

const groundDash: CharacterDoc = {
  id: 'dash-ground',
  rig: 'dash',
  personality: { energy: 0.8, bounciness: 0.85, confidence: 0.8, sloppiness: 0.3 },
  locomotion: { modes: ['walk', 'hop'], maxJumpHeight: 120, maxJumpDistance: 180 },
}

// One world per page — the site mounts a page at a time; so does this harness.
const pageWorlds = worldFromNotebook(notebook.pages)

// ── panel outlines (shared) ──────────────────────────────────────────────────────
function panelRects(cw: CollisionWorld): ReactElement[] {
  return cw.panels.map((p) => (
    <rect key={p.entity} x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} fill="#fffdf6" stroke="#b9b2a0" strokeWidth={1.5} />
  ))
}

// ── GRAPH strip (per selected page) ───────────────────────────────────────────────
function GraphView(p: { page: number }): ReactElement {
  const { cw, graph, nodeById } = useMemo(() => {
    const world = pageWorlds[p.page].world
    const cw = buildCollisionWorld(world)
    const graph = buildTraversalGraph(world, groundDash)
    return { cw, graph, nodeById: new Map(graph.nodes.map((n) => [n.id, n])) }
  }, [p.page])
  const counts = graph.edges.reduce<Record<string, number>>((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {})
  return (
    <div>
      <div className="meta" data-graph-meta>
        page {p.page} ({pageWorlds[p.page].name}) · {graph.nodes.length} nodes · {graph.edges.length} edges · walk {counts.walk ?? 0} / hop {counts.hop ?? 0} / jump {counts.jump ?? 0}. Black dot = interior spot (anchor); orange dot = roof endpoint.
      </div>
      <svg viewBox={VB} width={W} height={H} data-strip="graph" style={{ background: '#faf7ee' }}>
        {panelRects(cw)}
        {graph.edges.map((e, i) => {
          const a = nodeById.get(e.from)!
          const b = nodeById.get(e.to)!
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR[e.type]} strokeWidth={e.type === 'walk' ? 2.5 : e.type === 'hop' ? 1.6 : 0.8} strokeOpacity={e.type === 'jump' ? 0.4 : 0.9} />
        })}
        {graph.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={n.kind === 'interior' ? 4.5 : 3.5} fill={n.kind === 'interior' ? '#1a1a1a' : '#e8590c'} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
    </div>
  )
}

// ── COLLISION strip (live draggable capsule, per selected page) ───────────────────
const CAP_R = 16
function capsuleFrom(cx: number, cy: number): Capsule {
  return { x0: cx, y0: cy - 12, x1: cx, y1: cy + 12, r: CAP_R }
}

function CollisionView(p: { page: number }): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const cw = useMemo(() => buildCollisionWorld(pageWorlds[p.page].world), [p.page])
  // Start just left of the first panel's left wall so the +40px sweep shows a hit.
  const start = useMemo(() => {
    const b = cw.panels[0].box
    return { x: b.x - CAP_R - 6, y: b.y + b.h / 2 }
  }, [cw])
  const [pos, setPos] = useState(start)
  useEffect(() => setPos(start), [start])
  const [read, setRead] = useState('')

  const cap = capsuleFrom(pos.x, pos.y)
  // sweep a small step to the RIGHT (into the layout) to surface a blocked event
  const hit = sweptCapsuleVsSegments(cap, 40, 0, cw.segments)
  const enclosed = isEnclosed(pos.x, pos.y, cw)
  const event = hit ? (hit.ny < -0.5 ? 'landed' : 'blocked') : 'clear'

  useEffect(() => {
    setRead(
      `page ${p.page} · probe (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})\n` +
        `swept +40px →  event: ${event}${hit ? `  @t=${hit.t.toFixed(3)}  n=(${hit.nx.toFixed(2)}, ${hit.ny.toFixed(2)})  seg#${hit.segIndex} of ${hit.entity}` : ''}\n` +
        `isEnclosed: ${enclosed}`,
    )
  }, [p.page, pos.x, pos.y, event, hit, enclosed])

  const svgPoint = (ev: PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height }
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let dragging = false
    const down = (ev: PointerEvent): void => { dragging = true; setPos(svgPoint(ev)); svg.setPointerCapture(ev.pointerId) }
    const move = (ev: PointerEvent): void => { if (dragging) setPos(svgPoint(ev)) }
    const up = (): void => { dragging = false }
    svg.addEventListener('pointerdown', down)
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', up)
    return () => { svg.removeEventListener('pointerdown', down); svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up) }
  }, [])

  const color = event === 'blocked' ? '#e03131' : event === 'landed' ? '#2f9e44' : '#1c7ed6'
  return (
    <div>
      <svg ref={svgRef} viewBox={VB} width={W} height={H} data-strip="collision" style={{ background: '#faf7ee', touchAction: 'none', cursor: 'grab' }}>
        {panelRects(cw)}
        {enclosed && (() => {
          const pp = cw.panels.find((q) => pos.x >= q.box.x && pos.x <= q.box.x + q.box.w && pos.y >= q.box.y && pos.y <= q.box.y + q.box.h)
          return pp ? <rect x={pp.box.x} y={pp.box.y} width={pp.box.w} height={pp.box.h} fill="#fff3bf" stroke="#f08c00" strokeWidth={2} /> : null
        })()}
        {/* capsule = round-capped thick line */}
        <line x1={cap.x0} y1={cap.y0} x2={cap.x1} y2={cap.y1} stroke={color} strokeWidth={CAP_R * 2} strokeLinecap="round" opacity={0.85} />
        {hit && (() => {
          const cx = cap.x0
          const cy = (cap.y0 + cap.y1) / 2
          return <line x1={cx} y1={cy} x2={cx + hit.nx * 40} y2={cy + hit.ny * 40} stroke="#1a1a1a" strokeWidth={2} markerEnd="url(#arrow)" />
        })()}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#1a1a1a" />
          </marker>
        </defs>
      </svg>
      <div className="readout" data-readout>{read}</div>
    </div>
  )
}

// ── REST strip (verlet + collision pass; fixed to the WORK page's banner) ─────────
function RestView(): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // The WORK page (index 2), wide banner panel (index 2) as the resting surface.
    const cw = buildCollisionWorld(pageWorlds[2].world)
    const panel = cw.panels.find((p) => p.entity === 'panel:2:2') ?? cw.panels[0]
    const box = panel.box
    // outline
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('x', String(box.x)); rect.setAttribute('y', String(box.y))
    rect.setAttribute('width', String(box.w)); rect.setAttribute('height', String(box.h))
    rect.setAttribute('fill', '#fffdf6'); rect.setAttribute('stroke', '#b9b2a0'); rect.setAttribute('stroke-width', '1.5')
    svg.appendChild(rect)

    const vw = createVerletWorld()
    vw.setCollisionPass(createVerletPanelCollider(cw))
    const cx = box.x + box.w / 2
    // a bar dropped from above the panel top
    const bar = vw.addBody('bar', [{ x: cx - 24, y: box.y - 140 }, { x: cx + 24, y: box.y - 140 }], [{ kind: 'distance', a: 0, b: 1, rest: 48, stiffness: 1 }], 'prop', { gravityScale: 1 })
    // a rope draped across the panel top
    vw.addRope('rope', { ax: box.x - 30, ay: box.y - 80, bx: box.x + box.w + 30, by: box.y - 80, particles: 24, slack: 0.5 })

    const propR = createPropRenderer(svg, { w: 48, h: 10 })
    const ropeR = createRopeRenderer(svg)
    for (let t = 0; t < 420; t++) vw.step() // settle deterministically
    propR.render(vw.particle(bar.particleIds[0]), vw.particle(bar.particleIds[1]), vw.isAsleep('bar'))
    ropeR.render(vw.ropePoints('rope'))
    return () => { rect.remove(); propR.destroy(); ropeR.destroy() }
  }, [])
  return <svg ref={svgRef} viewBox="120 300 700 340" width={700} height={340} data-strip="rest" style={{ background: '#faf7ee' }} />
}

function App(): ReactElement {
  const [page, setPage] = useState(0) // page 0 (INTRO) is the busiest — 6 panels
  return (
    <div>
      <section>
        <h2>PAGE</h2>
        <div className="meta">Pages are separate worlds (a page change is a flip, never a traversal edge) — pick one:</div>
        <div>
          {pageWorlds.map((pw) => (
            <button key={pw.pageIndex} onClick={() => setPage(pw.pageIndex)} style={{ fontWeight: page === pw.pageIndex ? 700 : 400 }} data-page-btn={pw.pageIndex}>
              {pw.pageIndex} · {pw.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>GRAPH — selected page + traversal graph (Dash ground caps)</h2>
        <div className="legend">
          <span><i className="swatch" style={{ background: EDGE_COLOR.walk }} />walk</span>
          <span><i className="swatch" style={{ background: EDGE_COLOR.hop }} />hop</span>
          <span><i className="swatch" style={{ background: EDGE_COLOR.jump }} />jump</span>
        </div>
        <div className="box"><GraphView page={page} /></div>
      </section>
      <section>
        <h2>COLLISION — swept capsule events + enclosure (drag the capsule)</h2>
        <div className="meta">The capsule sweeps +40px right each frame; a wall hit is a <b>blocked</b> event (red) with its outward normal drawn; a point inside a fully-walled panel is <b>enclosed</b> (panel highlights amber).</div>
        <div className="box"><CollisionView page={page} /></div>
      </section>
      <section>
        <h2>REST — prop + rope resting on a panel (verlet collision pass)</h2>
        <div className="meta">A bar dropped onto the WORK banner rests on its top edge and sleeps (hollow dot); a rope drapes over the panel, resting where it lies over the surface and hanging beside the edges.</div>
        <div className="box"><RestView /></div>
      </section>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
