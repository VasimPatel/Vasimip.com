// Dev-only Phase 6b "mutable boundaries" review (NOT part of the prod build —
// nothing in src/ imports it). One page's world becomes a MutableWorld with every
// panel damageable; the review surfaces:
//  • CLICK-TO-CUT   — click near a panel edge → cut a hole; a comic torn-edge mask
//    is drawn straight from holesInPanel() data (jagged rip, paper-colored gap).
//  • HEAL COUNTDOWN — each hole knits back as its heal timer ticks down (the gap
//    closes, the torn edges meet), then vanishes with a `healed` event.
//  • PROJECTILE     — a launcher fires a laser at a panel; a swept hit cuts a fresh
//    hole (projectile×damageable→cut via the rule table).
//  • TRAVERSAL      — the graph overlay rebuilds live through every cut/heal.
//  • ENCLOSURE      — a draggable capsule reports isEnclosed against the live world.
// Served via:  bunx vite packages/renderer-svg/dev --port 5197  → /world6b.html
import { StrictMode, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  createMutableWorld,
  createProjectileSim,
  createRuleTable,
  nearestEdgeInterval,
  worldFromNotebook,
  STEP_MS,
  type Capsule,
  type HoleRecord,
} from '../../engine/src/index'
import type { CharacterDoc, WorldDocV2 } from '../../schema/src/index'

import notebook from '../../../src/notebook/notebook.json'

const VB = '0 0 960 700'
const W = 960
const H = 700
const PAPER = '#fffdf6'
const INK = '#1a1a1a'
const EDGE_COLOR: Record<string, string> = { walk: '#2f9e44', hop: '#1c7ed6', jump: '#e8590c', fly: '#ae3ec9' }

const HEAL_MS = 2600 // slow enough to watch the mask knit back
const CUT_WIDTH = 34
const TOTAL_HEAL_TICKS = Math.ceil(HEAL_MS / STEP_MS)

const groundDash: CharacterDoc = {
  id: 'dash-ground',
  rig: 'dash',
  personality: { energy: 0.8, bounciness: 0.85, confidence: 0.8, sloppiness: 0.3 },
  locomotion: { modes: ['walk', 'hop'], maxJumpHeight: 120, maxJumpDistance: 180 },
}

// Page 0 (INTRO) is the busiest — 6 panels. Make every panel damageable so any edge
// is cuttable, with a slow heal so the knit-back is watchable.
function damageablePage(): WorldDocV2 {
  const world = worldFromNotebook(notebook.pages)[0].world
  const clone: WorldDocV2 = structuredClone(world)
  for (const e of clone.entities) {
    if (e.components.surface && e.components.collidable) (e.components as any).damageable = { healAfterMs: HEAL_MS }
  }
  return clone
}

const CAP_R = 16
const capsuleAt = (cx: number, cy: number): Capsule => ({ x0: cx, y0: cy - 12, x1: cx, y1: cy + 12, r: CAP_R })

// ── comic torn-edge mask, drawn from a HoleRecord ────────────────────────────────
// The rip runs ALONG the removed span; jaggies oscillate PERPENDICULAR into a gap
// whose half-height = base × knit (1 = fresh, 0 = fully healed) so the two torn
// edges close together as the hole knits back.
function tornEdge(h: HoleRecord, knit: number): ReactElement {
  const ax = h.x2 - h.x1
  const ay = h.y2 - h.y1
  const len = Math.hypot(ax, ay) || 1
  const ux = ax / len
  const uy = ay / len
  const px = -uy // perpendicular (into/out of the panel)
  const py = ux
  // The whole rip (gap + jaggies) scales with `knit`, so as the hole heals the two
  // torn edges collapse together onto the wall line — the mask visibly knits shut.
  const gap = 8 * knit
  const n = Math.max(3, Math.round(len / 6))
  // deterministic jagged amplitudes (no random → stable screenshots)
  const amp = (i: number): number => (2.2 + ((i * 37) % 5) * 1.2) * knit
  const side = (sgn: number): string => {
    let d = ''
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const bx = h.x1 + ax * t
      const by = h.y1 + ay * t
      const off = (gap + (i % 2 === 0 ? amp(i) : -amp(i))) * sgn
      d += `${i === 0 ? 'M' : 'L'} ${(bx + px * off).toFixed(2)} ${(by + py * off).toFixed(2)} `
    }
    return d
  }
  return (
    <g key={h.id} opacity={0.35 + 0.65 * knit}>
      {/* paper-colored gap erasing the wall line */}
      <line x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} stroke={PAPER} strokeWidth={gap * 2 + 4} strokeLinecap="round" />
      {/* the two torn paper boundaries */}
      <path d={side(1)} fill="none" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <path d={side(-1)} fill="none" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
    </g>
  )
}

interface Snap {
  panels: { entity: string; box: { x: number; y: number; w: number; h: number }; fullyWalled: boolean }[]
  graph: { nodes: { id: string; x: number; y: number; kind: string }[]; edges: { from: string; to: string; type: string }[] }
  holes: HoleRecord[]
  projectiles: { x: number; y: number }[]
}

function App(): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [tick, setTick] = useState(0)
  const [cap, setCap] = useState({ x: 120, y: 120 })

  // build once
  const built = useMemo(() => {
    const mw = createMutableWorld(damageablePage(), { character: groundDash, stepMs: STEP_MS })
    const sim = createProjectileSim(mw, createRuleTable(), { cutWidth: CUT_WIDTH })
    return { mw, sim }
  }, [])

  // rAF sim loop — advances heal timers + projectiles, re-renders.
  useEffect(() => {
    let raf = 0
    let running = true
    const tick = (): void => {
      if (!running) return
      built.mw.stepMutations()
      built.sim.step()
      setTick((t) => (t + 1) & 0xffff)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // expose hooks for the screenshot harness
    ;(window as any).__world6b = {
      cutEdge: (panelId: string, x: number, y: number) => {
        const p = built.mw.collision().panels.find((q) => q.entity === panelId) ?? built.mw.collision().panels[0]
        const spec = nearestEdgeInterval(p.box, x, y, CUT_WIDTH)
        built.mw.cut(p.entity, spec)
      },
      fire: () => fireAt(),
      pause: () => { running = false; cancelAnimationFrame(raf) },
      resume: () => { running = true; raf = requestAnimationFrame(tick) },
      stepN: (n: number) => { for (let i = 0; i < n; i++) { built.mw.stepMutations(); built.sim.step() } setTick((t) => (t + 1) & 0xffff) },
      panels: () => built.mw.collision().panels.map((p) => ({ entity: p.entity, box: p.box })),
      holeCount: () => built.mw.allHoles().length,
      setCap: (x: number, y: number) => setCap({ x, y }),
      totalTicks: TOTAL_HEAL_TICKS,
    }
    return () => { running = false; cancelAnimationFrame(raf) }
  }, [built])

  const snap: Snap = useMemo(() => {
    const cw = built.mw.collision()
    const g = built.mw.traversal()
    return {
      panels: cw.panels.map((p) => ({ entity: p.entity, box: p.box, fullyWalled: p.fullyWalled })),
      graph: { nodes: g.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, kind: n.kind })), edges: g.edges.map((e) => ({ from: e.from, to: e.to, type: e.type })) },
      holes: built.mw.allHoles(),
      projectiles: built.sim.active().map((p) => ({ x: p.x, y: p.y })),
    }
    // `tick` is the intentional re-derive signal (every sim step bumps it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, tick, cap])

  // enclosure readout, recomputed each render
  const enclosed = built.mw.isEnclosed(cap.x, cap.y)
  const read = `capsule (${cap.x.toFixed(0)}, ${cap.y.toFixed(0)})  ·  isEnclosed: ${enclosed}  ·  holes: ${snap.holes.length}  ·  tick ${built.mw.getTick()}`

  const svgPoint = (ev: PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height }
  }

  const nodeById = new Map(snap.graph.nodes.map((n) => [n.id, n]))

  function fireAt(): void {
    // fire a laser rightward from just inside the first panel — it crosses the
    // interior (visible in-frame) and cuts the far (right) wall on impact.
    const p = built.mw.collision().panels[0]
    const y = p.box.y + p.box.h / 2
    built.sim.fire({ x: p.box.x + 24, y, vx: 5200, vy: 0, r: 3 })
  }

  // pointer: near an edge → CUT; otherwise → move the probe capsule.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const down = (ev: PointerEvent): void => {
      const pt = svgPoint(ev)
      const cw = built.mw.collision()
      // panel whose edge is nearest the click (within a tolerance) → cut it
      let target: { entity: string; box: any } | null = null
      let bestD = 16
      for (const p of cw.panels) {
        const spec = nearestEdgeInterval(p.box, pt.x, pt.y, CUT_WIDTH)
        // distance from click to the spec's centre point
        const cx = spec.edge === 'wallL' ? p.box.x : spec.edge === 'wallR' ? p.box.x + p.box.w : p.box.x + spec.start + spec.width / 2
        const cy = spec.edge === 'roof' ? p.box.y : spec.edge === 'bottom' ? p.box.y + p.box.h : p.box.y + spec.start + spec.width / 2
        const d = Math.hypot(pt.x - cx, pt.y - cy)
        if (d < bestD) { bestD = d; target = { entity: p.entity, box: p.box } }
      }
      if (target) {
        const spec = nearestEdgeInterval(target.box, pt.x, pt.y, CUT_WIDTH)
        built.mw.cut(target.entity, spec)
      } else {
        setCap(pt)
      }
    }
    svg.addEventListener('pointerdown', down)
    return () => svg.removeEventListener('pointerdown', down)
  }, [built])

  const capsule = capsuleAt(cap.x, cap.y)
  const totalTicks = TOTAL_HEAL_TICKS

  return (
    <div>
      <section>
        <div className="legend">
          <span><i className="swatch" style={{ background: EDGE_COLOR.walk }} />walk</span>
          <span><i className="swatch" style={{ background: EDGE_COLOR.hop }} />hop</span>
          <span><i className="swatch" style={{ background: EDGE_COLOR.jump }} />jump</span>
          <span>· click an edge to cut · drag elsewhere to move the capsule</span>
        </div>
        <div>
          <button onClick={() => fireAt()} data-fire>Fire projectile →</button>
        </div>
        <div className="box">
          <svg ref={svgRef} viewBox={VB} width={W} height={H} data-strip="world6b" style={{ background: '#faf7ee', touchAction: 'none', cursor: 'crosshair' }}>
            {/* panels */}
            {snap.panels.map((p) => (
              <rect key={p.entity} x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} fill={PAPER} stroke={p.fullyWalled ? '#b9b2a0' : '#e8590c'} strokeWidth={p.fullyWalled ? 1.5 : 2} strokeDasharray={p.fullyWalled ? undefined : '6 4'} />
            ))}
            {/* enclosure highlight */}
            {enclosed && (() => {
              const pp = snap.panels.find((q) => cap.x >= q.box.x && cap.x <= q.box.x + q.box.w && cap.y >= q.box.y && cap.y <= q.box.y + q.box.h)
              return pp ? <rect x={pp.box.x} y={pp.box.y} width={pp.box.w} height={pp.box.h} fill="#fff3bf" stroke="#f08c00" strokeWidth={2} /> : null
            })()}
            {/* traversal graph */}
            {snap.graph.edges.map((e, i) => {
              const a = nodeById.get(e.from)!
              const b = nodeById.get(e.to)!
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR[e.type]} strokeWidth={e.type === 'walk' ? 2.5 : e.type === 'hop' ? 1.6 : 0.8} strokeOpacity={e.type === 'jump' ? 0.4 : 0.9} />
            })}
            {snap.graph.nodes.map((n) => (
              <circle key={n.id} cx={n.x} cy={n.y} r={n.kind === 'interior' ? 4.5 : 3.5} fill={n.kind === 'interior' ? INK : '#e8590c'} stroke="#fff" strokeWidth={1} />
            ))}
            {/* torn-edge holes */}
            {snap.holes.map((h) => tornEdge(h, h.healAfterMs == null || h.remainingTicks == null ? 1 : Math.max(0, h.remainingTicks / totalTicks)))}
            {/* projectiles */}
            {snap.projectiles.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={4} fill="#e03131" stroke="#fff" strokeWidth={1} />
            ))}
            {/* probe capsule */}
            <line x1={capsule.x0} y1={capsule.y0} x2={capsule.x1} y2={capsule.y1} stroke={enclosed ? '#f08c00' : '#1c7ed6'} strokeWidth={CAP_R * 2} strokeLinecap="round" opacity={0.8} />
          </svg>
          <div className="readout" data-readout>{read}</div>
        </div>
      </section>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
