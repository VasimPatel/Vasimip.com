// Dev-only Phase 7a "behavior" review (NOT part of the prod build — nothing in src/
// imports it). Drives the character runtime through its four locomotion verbs on
// FRESH per-run scenarios, rendering the solved skeleton + collision capsule +
// traversal graph so the motion can be read frame-by-frame:
//   • WALK    — INTRO page world; a routed multi-leg moveTo to a far panel, with the
//               planned path (path:leg targets) drawn as a highlighted polyline.
//   • JUMP    — a custom continuous floor; jumpTo ~150px ahead → the full ballistic
//               choreography (anticipation → launch → apex → tuck → land → settle).
//   • BLOCKED — a 4-wall cell with Dash ENCLOSED inside; moveTo an outside goal walks
//               him into the wall and the capsule rests against it (intent:blocked).
//   • FLY     — a synthetic winged character flyThrough a few waypoints, trailing a
//               fading polyline of its past positions.
// Served via:  bunx vite packages/renderer-svg/dev --port 5199  → /behavior.html
// Screenshot harness drives window.__behavior (pause / stepN / run / launchTick…).
import { StrictMode, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  createCharacterRuntime,
  createContext,
  createMutableWorld,
  createVerletWorld,
  worldFromNotebook,
  panelEdges,
  STEP_MS,
  type MutableWorld,
  type CharacterRuntime,
  type EngineContext,
  type VerletWorld,
  type Capsule,
} from '../../engine/src/index'
import type { CharacterDoc, WorldDocV2, RigTemplate, Clip, Pose, BehaviorDoc } from '../../schema/src/index'

import notebook from '../../../src/notebook/notebook.json'
import rigJson from '../../../content/engine/rig.dash.json'
import characterJson from '../../../content/engine/character.dash.json'
import jumpClip from '../../../content/engine/clips/jump.json'
import idleClip from '../../../content/engine/clips/idle-shuffle.json'
import walkClip from '../../../content/engine/clips/walk-cycle.json'
import standPose from '../../../content/engine/poses/stand.json'
import tuckPose from '../../../content/engine/poses/jump-tuck.json'
import landPose from '../../../content/engine/poses/squash-land.json'
import cheerPose from '../../../content/engine/poses/cheer.json'
import thinkPose from '../../../content/engine/poses/think.json'
import walkMidPose from '../../../content/engine/poses/walk-mid.json'

// ── content (JSON → typed) ─────────────────────────────────────────────────────────
const rig = rigJson as unknown as RigTemplate
const character = characterJson as unknown as CharacterDoc
const clips: Record<string, Clip> = {
  'idle-shuffle': idleClip as unknown as Clip,
  'walk-cycle': walkClip as unknown as Clip,
  jump: jumpClip as unknown as Clip,
}
const poses: Record<string, Pose> = {
  stand: standPose as unknown as Pose,
  'jump-tuck': tuckPose as unknown as Pose,
  'squash-land': landPose as unknown as Pose,
  cheer: cheerPose as unknown as Pose,
  think: thinkPose as unknown as Pose,
  'walk-mid': walkMidPose as unknown as Pose,
}
const NAMES = { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' } as const
const REST = poses.stand

// ── palette / layout ────────────────────────────────────────────────────────────────
// 60px of headroom above y=0 so a character standing on a top-row roof (INTRO walk,
// y≈40) isn't clipped. Default preserveAspectRatio letterboxes without distortion.
const VB = '0 -60 960 760'
const W = 960
const H = 760
const PAPER = '#fffdf6'
const INK = character.style?.color ?? '#1a1a1a'
const CAPE = character.palette?.cape ?? '#ff5ca8'
const HEADFILL = character.palette?.head ?? '#fffdf6'
const EDGE_COLOR: Record<string, string> = { walk: '#2f9e44', hop: '#1c7ed6', jump: '#e8590c', fly: '#ae3ec9' }
const PATH_COLOR = '#f08c00'
const TRAIL_COLOR = '#ae3ec9'

type Which = 'walk' | 'jump' | 'blocked' | 'fly'

// ── world builders ────────────────────────────────────────────────────────────────
const seg = panelEdges // alias

/** A solid comic panel (surface + collidable) at box, standable on its roof/interior. */
function panel(id: string, box: { x: number; y: number; w: number; h: number }, anchor = { dx: box.w / 2, dy: box.h / 2 }): WorldDocV2['entities'][number] {
  return {
    id,
    components: {
      transform: { x: box.x, y: box.y },
      surface: { box, anchor },
      collidable: { shape: 'segments', segments: seg(box) },
    },
  } as unknown as WorldDocV2['entities'][number]
}

/** A transform-only marker entity — a resolvable point target, no collision. */
function marker(id: string, x: number, y: number): WorldDocV2['entities'][number] {
  return { id, components: { transform: { x, y } } } as unknown as WorldDocV2['entities'][number]
}

function emptyWorld(id: string, entities: WorldDocV2['entities']): WorldDocV2 {
  return { schemaVersion: 2, id, entities } as unknown as WorldDocV2
}

// ── scenario ─────────────────────────────────────────────────────────────────────────
interface Scenario {
  which: Which
  ctx: EngineContext
  verlet: VerletWorld
  mw: MutableWorld
  rt: CharacterRuntime
  markers: { id: string; x: number; y: number; role: 'goal' | 'waypoint' }[]
  trail: { x: number; y: number }[]
  tick: number
}

function placeFeet(rt: CharacterRuntime, floorY: number): void {
  const c = rt.capsule()
  rt.transform.y += floorY - (c.y1 + c.r)
}

function buildScenario(which: Which): Scenario {
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()

  const mk = (world: WorldDocV2, char: CharacterDoc, initial: { x: number; y: number }): { mw: MutableWorld; rt: CharacterRuntime } => {
    const mw = createMutableWorld(world, { character: char, events: ctx.events, stepMs: STEP_MS })
    const rt = createCharacterRuntime({
      rig,
      character: char,
      world: mw,
      verlet,
      rng: ctx.rng,
      events: ctx.events,
      clips,
      poses,
      names: { ...NAMES },
      restPose: REST,
      initialTransform: { x: initial.x, y: initial.y, rot: 0, facing: 1 },
    })
    return { mw, rt }
  }

  if (which === 'walk') {
    // INTRO page (busiest, 6 panels). A GROUND-only character (no fly) so the graph
    // shows only walk/hop/jump edges and the solver routes a real multi-leg path
    // over the roofs. Stand on the roof of the top-left panel and moveTo a far panel.
    const groundChar: CharacterDoc = { ...character, id: 'dash-ground', locomotion: { modes: ['walk', 'hop'], maxJumpHeight: 120, maxJumpDistance: 180 } } as CharacterDoc
    const world = worldFromNotebook(notebook.pages)[0].world
    // stand on the top-left panel's roof and moveTo the far-right panel → the solver
    // routes a multi-leg walk→jump→jump across the top row over the typed graph.
    const { mw, rt } = mk(world, groundChar, { x: 120, y: 40 })
    placeFeet(rt, 40) // roof of panel:0:0 (y=40)
    rt.locomotion.begin({ verb: 'moveTo', target: 'panel:panel:0:1#roof' })
    return { which, ctx, verlet, mw, rt, markers: [], trail: [], tick: 0 }
  }

  if (which === 'jump') {
    // continuous floor; jump ~150px ahead along it → full ballistic arc.
    const floorBox = { x: 180, y: 320, w: 600, h: 260 }
    const goalX = 470 // ~150 ahead of the start (x≈320)
    const world = emptyWorld('jump-world', [panel('floor', floorBox, { dx: 300, dy: 0 }), marker('jumpGoal', goalX, 320)])
    const { mw, rt } = mk(world, character, { x: 320, y: 320 })
    placeFeet(rt, 320) // roof of the floor box
    rt.locomotion.begin({ verb: 'jumpTo', target: 'entity:jumpGoal' })
    return { which, ctx, verlet, mw, rt, markers: [{ id: 'jumpGoal', x: goalX, y: 320, role: 'goal' }], trail: [], tick: 0 }
  }

  if (which === 'blocked') {
    // 4-wall cell; Dash ENCLOSED at the interior floor; moveTo an outside goal →
    // direct ground leg into the right wall → capsule rests against it.
    const cellBox = { x: 300, y: 240, w: 220, h: 220 }
    const world = emptyWorld('cell-world', [panel('cell', cellBox, { dx: 110, dy: 110 }), marker('goal', 720, 350)])
    const { mw, rt } = mk(world, character, { x: 360, y: 350 })
    placeFeet(rt, 350) // interior floor (cellBox.y + anchor.dy = 240+110)
    rt.locomotion.begin({ verb: 'moveTo', target: 'entity:goal' })
    return { which, ctx, verlet, mw, rt, markers: [{ id: 'goal', x: 720, y: 350, role: 'goal' }], trail: [], tick: 0 }
  }

  // fly — winged character; flyThrough a swoop of waypoints, over a couple of
  // decorative floor panels, trailing its past positions.
  const bird: CharacterDoc = { ...character, id: 'bird', locomotion: { modes: ['fly'], flySpeed: 200 } } as CharacterDoc
  const wps = [
    { id: 'wp1', x: 340, y: 180 },
    { id: 'wp2', x: 540, y: 460 },
    { id: 'wp3', x: 760, y: 220 },
  ]
  const world = emptyWorld('sky-world', [
    panel('ground-a', { x: 120, y: 560, w: 300, h: 120 }, { dx: 150, dy: 0 }),
    panel('ground-b', { x: 560, y: 520, w: 300, h: 120 }, { dx: 150, dy: 0 }),
    ...wps.map((w) => marker(w.id, w.x, w.y)),
  ])
  const { mw, rt } = mk(world, bird, { x: 140, y: 300 })
  const doc: BehaviorDoc = {
    schemaVersion: 2,
    id: 'bird-swoop',
    steps: [
      { verb: 'flyThrough', target: 'entity:wp1' },
      { verb: 'flyThrough', target: 'entity:wp2' },
      { verb: 'flyTo', target: 'entity:wp3' },
    ],
  } as unknown as BehaviorDoc
  rt.runBehavior(doc)
  return { which, ctx, verlet, mw, rt, markers: wps.map((w) => ({ ...w, role: 'waypoint' as const })), trail: [], tick: 0 }
}

// advance exactly one sim tick (clock BEFORE tick so emits are stamped this tick).
function stepOnce(s: Scenario): void {
  s.ctx.clock.advance()
  s.rt.tick()
  s.verlet.step()
  s.mw.stepMutations()
  s.tick = s.ctx.clock.tick
  s.trail.push({ x: s.rt.transform.x, y: s.rt.transform.y })
  if (s.trail.length > 260) s.trail.shift()
}

// ── readout / trace helpers ───────────────────────────────────────────────────────
const REPORTED = new Set(['intent:start', 'intent:arrived', 'intent:blocked', 'intent:failed', 'jump:launch', 'jump:land', 'path:route', 'path:leg'])
function fmtEvent(e: { tick: number; type: string; payload: unknown }): string {
  const p = (e.payload ?? {}) as Record<string, unknown>
  const num = (v: unknown): string => (typeof v === 'number' ? v.toFixed(0) : String(v))
  if (e.type === 'intent:blocked') return `t${e.tick} intent:blocked verb=${p.verb} rest x=${num(p.x)} y=${num(p.y)} @${p.entity}`
  if (e.type === 'intent:start') { const to = p.to as { x: number; y: number } | undefined; return `t${e.tick} intent:start ${p.verb} → ${p.target} (${to ? num(to.x) + ',' + num(to.y) : '?'})` }
  if (e.type === 'jump:launch') return `t${e.tick} jump:launch vx=${num(p.vx)} vy=${num(p.vy)}`
  if (e.type === 'jump:land') return `t${e.tick} jump:land x=${num(p.x)} y=${num(p.y)}`
  if (e.type === 'path:route') { const legs = (p.legs as { mode: string; edgeType?: string }[]) ?? []; return `t${e.tick} path:route ${legs.map((l) => l.edgeType ?? l.mode).join('→')}` }
  if (e.type === 'path:leg') return `t${e.tick} path:leg #${p.legIndex} ${p.edgeType}`
  if (e.type === 'intent:arrived') return `t${e.tick} intent:arrived ${p.verb}`
  if (e.type === 'intent:failed') return `t${e.tick} intent:failed ${p.verb} (${p.reason})`
  return `t${e.tick} ${e.type}`
}

function traceOf(s: Scenario): { tick: number; type: string; payload: unknown }[] {
  return s.ctx.events.trace().filter((e) => REPORTED.has(e.type)) as { tick: number; type: string; payload: unknown }[]
}
function jumpTick(s: Scenario, type: 'jump:launch' | 'jump:land'): number | null {
  const e = s.ctx.events.trace().find((ev) => ev.type === type)
  return e ? e.tick : null
}

// planned-path polyline (walk): Dash's start position followed by each leg target.
function plannedPath(s: Scenario): { x: number; y: number }[] {
  const legs = s.ctx.events.trace().filter((e) => e.type === 'path:leg')
  const pts = legs.map((e) => (e.payload as { target: { x: number; y: number } }).target)
  const first = s.trail[0]
  return first ? [first, ...pts] : pts
}

// ── skeleton rendering ────────────────────────────────────────────────────────────
function boneWidth(id: string): number {
  if (id === 'pelvis') return 6.5
  if (id === 'neck') return 5.5
  if (id === 'head') return 5
  if (id.startsWith('thigh') || id.startsWith('upperArm')) return 4
  return 3.4 // shins, forearms
}

function Character({ rt }: { rt: CharacterRuntime }): ReactElement {
  const sk = rt.solved()
  const head = sk.bones.find((b) => b.id === 'head')
  const neck = sk.bones.find((b) => b.id === 'neck')
  const overrides = rt.overrides()
  // cape: a short pink stroke trailing from the neck, opposite facing (or follow the
  // secondary override endpoint if present).
  const facing = rt.transform.facing
  let cape: ReactElement | null = null
  if (neck) {
    const ov = overrides['cape'] ?? overrides['neck']
    const tx = ov ? ov.ex : neck.ox - facing * 22
    const ty = ov ? ov.ey : neck.oy + 20
    cape = <path d={`M ${neck.ox} ${neck.oy} Q ${neck.ox - facing * 10} ${neck.oy + 14} ${tx} ${ty}`} fill="none" stroke={CAPE} strokeWidth={7} strokeLinecap="round" opacity={0.9} />
  }
  return (
    <g>
      {cape}
      {sk.bones.map((b) => (b.id === 'head' ? null : <line key={b.id} x1={b.ox} y1={b.oy} x2={b.ex} y2={b.ey} stroke={INK} strokeWidth={boneWidth(b.id)} strokeLinecap="round" />))}
      {head && <line x1={head.ox} y1={head.oy} x2={head.ex} y2={head.ey} stroke={INK} strokeWidth={5} strokeLinecap="round" />}
      {head && <circle cx={head.ex} cy={head.ey} r={9} fill={HEADFILL} stroke={INK} strokeWidth={2.4} />}
    </g>
  )
}

// ── app ───────────────────────────────────────────────────────────────────────────
function App(): ReactElement {
  const [which, setWhich] = useState<Which>('walk')
  const [, force] = useState(0)
  const rerender = (): void => force((n) => (n + 1) & 0xffff)
  const scenRef = useRef<Scenario | null>(null)
  const runningRef = useRef(true)

  // (re)build the scenario when `which` changes (also on first mount).
  useMemo(() => {
    scenRef.current?.rt.dispose()
    scenRef.current = buildScenario(which)
  }, [which])

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      if (!runningRef.current) return
      const s = scenRef.current
      if (s) { stepOnce(s); rerender() }
      raf = requestAnimationFrame(loop)
    }
    runningRef.current = true
    raf = requestAnimationFrame(loop)

    const B = {
      run(w: Which): void { runningRef.current = false; cancelAnimationFrame(raf); scenRef.current?.rt.dispose(); scenRef.current = buildScenario(w); setWhich(w); rerender() },
      pause(): void { runningRef.current = false; cancelAnimationFrame(raf) },
      resume(): void { if (!runningRef.current) { runningRef.current = true; raf = requestAnimationFrame(loop) } },
      stepN(n: number): void { const s = scenRef.current; if (!s) return; for (let i = 0; i < n; i++) stepOnce(s); rerender() },
      get which(): Which { return scenRef.current?.which ?? which },
      get tick(): number { return scenRef.current?.tick ?? 0 },
      get totalTicks(): number { return scenRef.current?.tick ?? 0 },
      mode(): string { return scenRef.current?.rt.locomotion.mode ?? 'idle' },
      status(): string { return scenRef.current?.rt.locomotion.status ?? 'idle' },
      running(): boolean { return scenRef.current?.rt.running() ?? false },
      readout(): string { const s = scenRef.current; return s ? readoutText(s) : '' },
      launchTick(): number | null { const s = scenRef.current; return s ? jumpTick(s, 'jump:launch') : null },
      landTick(): number | null { const s = scenRef.current; return s ? jumpTick(s, 'jump:land') : null },
    }
    ;(window as unknown as { __behavior: typeof B }).__behavior = B
    return () => { runningRef.current = false; cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [which])

  const s = scenRef.current
  if (!s) return <div />

  const cw = s.mw.collision()
  const g = s.mw.traversal()
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]))
  const cap: Capsule = s.rt.capsule()
  const path = which === 'walk' ? plannedPath(s) : []
  const showCapsule = which === 'blocked' || which === 'jump'

  return (
    <section>
      <div className="legend">
        <span><i className="swatch" style={{ background: EDGE_COLOR.walk }} />walk</span>
        <span><i className="swatch" style={{ background: EDGE_COLOR.hop }} />hop</span>
        <span><i className="swatch" style={{ background: EDGE_COLOR.jump }} />jump</span>
        <span><i className="swatch" style={{ background: EDGE_COLOR.fly }} />fly</span>
        <span><i className="swatch" style={{ background: PATH_COLOR }} />planned path</span>
      </div>
      <div>
        {(['walk', 'jump', 'blocked', 'fly'] as Which[]).map((w) => (
          <button key={w} data-run={w} data-active={which === w ? '' : undefined} onClick={() => setWhich(w)}>
            {w === 'walk' ? 'Walk to far panel' : w === 'jump' ? 'Jump to roof' : w === 'blocked' ? 'Walk into a wall' : 'Fly (bird)'}
          </button>
        ))}
      </div>
      <div className="box">
        <svg viewBox={VB} width={W} height={H} data-strip="behavior" style={{ background: '#faf7ee' }}>
          {/* panels */}
          {cw.panels.map((p) => (
            <rect key={p.entity} x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} fill={PAPER} stroke="#b9b2a0" strokeWidth={1.5} />
          ))}
          {/* traversal graph */}
          {g.edges.map((e, i) => {
            const a = nodeById.get(e.from)
            const b = nodeById.get(e.to)
            if (!a || !b) return null
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR[e.type] ?? '#999'} strokeWidth={e.type === 'walk' ? 2.5 : e.type === 'hop' ? 1.8 : 1} strokeOpacity={e.type === 'jump' ? 0.4 : 0.85} />
          })}
          {g.nodes.map((n) => (
            <circle key={n.id} cx={n.x} cy={n.y} r={n.kind === 'interior' ? 4 : 3.2} fill={n.kind === 'interior' ? INK : '#e8590c'} stroke="#fff" strokeWidth={1} />
          ))}
          {/* planned-path overlay (walk) */}
          {path.length > 1 && (
            <>
              <polyline points={path.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={PATH_COLOR} strokeWidth={4} strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 8" />
              {path.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4.5} fill={PATH_COLOR} stroke="#fff" strokeWidth={1.2} />)}
            </>
          )}
          {/* waypoint trail (fly) */}
          {which === 'fly' && s.trail.length > 1 && (
            <polyline points={s.trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={TRAIL_COLOR} strokeWidth={3} strokeOpacity={0.5} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* markers (goal / waypoints) */}
          {s.markers.map((m) => (
            <g key={m.id}>
              <circle cx={m.x} cy={m.y} r={7} fill="none" stroke={m.role === 'goal' ? '#e03131' : TRAIL_COLOR} strokeWidth={2.4} />
              <circle cx={m.x} cy={m.y} r={2} fill={m.role === 'goal' ? '#e03131' : TRAIL_COLOR} />
            </g>
          ))}
          {/* collision capsule (blocked/jump — read the resting contact) */}
          {showCapsule && (
            <line x1={cap.x0} y1={cap.y0} x2={cap.x1} y2={cap.y1} stroke="#1c7ed6" strokeWidth={cap.r * 2} strokeLinecap="round" opacity={0.28} />
          )}
          {/* the character */}
          <Character rt={s.rt} />
        </svg>
        <div className="readout" data-readout>{readoutText(s)}</div>
      </div>
    </section>
  )
}

function readoutText(s: Scenario): string {
  const header = `${s.which}  ·  mode=${s.rt.locomotion.mode}  ·  status=${s.rt.locomotion.status}  ·  running=${s.rt.running()}  ·  tick ${s.tick}`
  const tr = traceOf(s)
  const recent = tr.slice(-5).map(fmtEvent)
  return [header, ...recent].join('\n')
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
