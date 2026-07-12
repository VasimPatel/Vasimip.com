// Dev-only behavior review (NOT part of the prod build — nothing in src/ imports it).
// Phase 7a drove the four locomotion verbs; Phase 7b adds the reaction / cue / speech
// layer:
//   • WALLTEST — THE north-star gate, live: two side-by-side worlds running the SAME
//     doc. LEFT = enclosed → run into the wall → the authored onBlocked bonk reaction
//     (squash pose + "ow!" speech bubble + a backward impulse). RIGHT = outside → a
//     clean traversal, no reaction. Each panel logs its trace as comic captions.
//   • HOP / VAULT / TIGHTROPE — the three re-authored built-ins (real content JSON)
//     run on a floor world: hop = launch/land/arrive; vault = an onLaunch flourish cue;
//     tightrope = a moveTo with say/pose beats + an onArrive cue.
//   • SAY speech bubbles render from rt.speech() in every mode.
// Original 7a modes (walk / jump / blocked / fly) are unchanged.
// Served via:  bunx vite packages/renderer-svg/dev --port 5199  → /behavior.html
// Screenshot harness drives window.__behavior (pause / stepN / run / launchTick…).
import { StrictMode, useEffect, useMemo, useRef, useState, type ReactElement, type CSSProperties } from 'react'
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
import hopJson from '../../../content/engine/behaviors/hop.json'
import vaultJson from '../../../content/engine/behaviors/vault.json'
import tightropeJson from '../../../content/engine/behaviors/tightrope.json'

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

const HOP = hopJson as unknown as BehaviorDoc
const VAULT = vaultJson as unknown as BehaviorDoc
const TIGHTROPE = tightropeJson as unknown as BehaviorDoc

// The Wall Test doc — one moveTo with an authored onBlocked bonk reaction. Byte-identical
// between the enclosed and open worlds (the whole point of the test).
const WALL_BEHAVIOR: BehaviorDoc = {
  schemaVersion: 2,
  id: 'wall-run',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
  reactions: {
    onBlocked: [
      { verb: 'strikePose', ref: 'squash-land', holdMs: 250 },
      { verb: 'say', text: 'ow!' },
      { verb: 'impulse', target: 'self', vec: [-140, -40] },
    ],
  },
} as unknown as BehaviorDoc

// ── palette / layout ────────────────────────────────────────────────────────────────
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

type Which = 'walk' | 'jump' | 'blocked' | 'fly' | 'walltest' | 'hop' | 'vault' | 'tightrope'
const NEW_MODES: Which[] = ['walltest', 'hop', 'vault', 'tightrope']
const isNew = (w: Which): boolean => NEW_MODES.includes(w)

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

// ── actor: one runtime with its OWN ctx + verlet (independent event log) ─────────────
interface Actor {
  ctx: EngineContext
  verlet: VerletWorld
  mw: MutableWorld
  rt: CharacterRuntime
  markers: { id: string; x: number; y: number; role: 'goal' | 'waypoint' }[]
  trail: { x: number; y: number }[]
}

function placeFeet(rt: CharacterRuntime, floorY: number): void {
  const c = rt.capsule()
  rt.transform.y += floorY - (c.y1 + c.r)
}

function buildActor(
  world: WorldDocV2,
  char: CharacterDoc,
  initial: { x: number; y: number },
  floorY: number | null,
): Actor {
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
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
  if (floorY !== null) placeFeet(rt, floorY)
  return { ctx, verlet, mw, rt, markers: [], trail: [] }
}

function stepActor(a: Actor): void {
  a.ctx.clock.advance()
  a.rt.tick()
  a.verlet.step()
  a.mw.stepMutations()
  a.trail.push({ x: a.rt.transform.x, y: a.rt.transform.y })
  if (a.trail.length > 260) a.trail.shift()
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
  /** WALLTEST only: the second (open-world) actor rendered in the right panel. */
  right?: Actor
}

// The floor for the built-in demos.
const FLOOR_BOX = { x: 80, y: 320, w: 680, h: 240 }

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

  // ── PHASE 7b modes ─────────────────────────────────────────────────────────────
  if (which === 'walltest') {
    // TWO independent worlds, ONE doc. Cell box + a goal outside the right wall.
    const BOX = { x: 120, y: 140, w: 200, h: 200 }
    const goalX = BOX.x + BOX.w + 120 // 440
    const goalY = BOX.y + BOX.h / 2 // 240
    const wallWorld = (): WorldDocV2 => emptyWorld('cell', [panel('cell', BOX, { dx: BOX.w / 2, dy: BOX.h / 2 }), marker('goal', goalX, goalY)])

    // LEFT: enclosed at the interior centre → runs into the wall → bonk reaction.
    const left = buildActor(wallWorld(), character, { x: BOX.x + BOX.w / 2, y: goalY }, goalY)
    left.markers = [{ id: 'goal', x: goalX, y: goalY, role: 'goal' }]
    left.rt.runBehavior(WALL_BEHAVIOR)
    // RIGHT: OUTSIDE the right wall → clean traversal to the goal, no reaction.
    const right = buildActor(wallWorld(), character, { x: BOX.x + BOX.w + 40, y: goalY }, goalY)
    right.markers = [{ id: 'goal', x: goalX, y: goalY, role: 'goal' }]
    right.rt.runBehavior(WALL_BEHAVIOR)

    return { which, ctx: left.ctx, verlet: left.verlet, mw: left.mw, rt: left.rt, markers: left.markers, trail: left.trail, tick: 0, right }
  }

  if (which === 'hop' || which === 'vault' || which === 'tightrope') {
    const startX = which === 'tightrope' ? 200 : 260
    const goalX = which === 'tightrope' ? startX + 220 : startX + 140
    const world = emptyWorld(`${which}-world`, [panel('floor', FLOOR_BOX, { dx: FLOOR_BOX.w / 2, dy: 0 }), marker('goal', goalX, FLOOR_BOX.y)])
    const { mw, rt } = mk(world, character, { x: startX, y: FLOOR_BOX.y })
    placeFeet(rt, FLOOR_BOX.y)
    rt.runBehavior(which === 'hop' ? HOP : which === 'vault' ? VAULT : TIGHTROPE)
    return { which, ctx, verlet, mw, rt, markers: [{ id: 'goal', x: goalX, y: FLOOR_BOX.y, role: 'goal' }], trail: [], tick: 0 }
  }

  // ── PHASE 7a modes (unchanged) ───────────────────────────────────────────────────
  if (which === 'walk') {
    const groundChar: CharacterDoc = { ...character, id: 'dash-ground', locomotion: { modes: ['walk', 'hop'], maxJumpHeight: 120, maxJumpDistance: 180 } } as CharacterDoc
    const world = worldFromNotebook(notebook.pages)[0].world
    const { mw, rt } = mk(world, groundChar, { x: 120, y: 40 })
    placeFeet(rt, 40)
    rt.locomotion.begin({ verb: 'moveTo', target: 'panel:panel:0:1#roof' })
    return { which, ctx, verlet, mw, rt, markers: [], trail: [], tick: 0 }
  }

  if (which === 'jump') {
    const floorBox = { x: 180, y: 320, w: 600, h: 260 }
    const goalX = 470
    const world = emptyWorld('jump-world', [panel('floor', floorBox, { dx: 300, dy: 0 }), marker('jumpGoal', goalX, 320)])
    const { mw, rt } = mk(world, character, { x: 320, y: 320 })
    placeFeet(rt, 320)
    rt.locomotion.begin({ verb: 'jumpTo', target: 'entity:jumpGoal' })
    return { which, ctx, verlet, mw, rt, markers: [{ id: 'jumpGoal', x: goalX, y: 320, role: 'goal' }], trail: [], tick: 0 }
  }

  if (which === 'blocked') {
    const cellBox = { x: 300, y: 240, w: 220, h: 220 }
    const world = emptyWorld('cell-world', [panel('cell', cellBox, { dx: 110, dy: 110 }), marker('goal', 720, 350)])
    const { mw, rt } = mk(world, character, { x: 360, y: 350 })
    placeFeet(rt, 350)
    rt.locomotion.begin({ verb: 'moveTo', target: 'entity:goal' })
    return { which, ctx, verlet, mw, rt, markers: [{ id: 'goal', x: 720, y: 350, role: 'goal' }], trail: [], tick: 0 }
  }

  // fly
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
  if (s.right) stepActor(s.right)
}

// ── readout / trace helpers ───────────────────────────────────────────────────────
const REPORTED = new Set(['intent:start', 'intent:arrived', 'intent:blocked', 'intent:failed', 'jump:launch', 'jump:land', 'path:route', 'path:leg'])
// 7b comic-caption vocabulary (the reaction / cue / speech layer).
const CAPTION = new Set([
  'intent:start', 'intent:arrived', 'intent:blocked', 'jump:launch', 'jump:land',
  'reaction:run', 'intent:say', 'intent:impulse', 'behavior:ended', 'behavior:complete',
  'cue:strikePose', 'intent:sfx',
])
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
// short, human comic captions for the 7b layer.
function fmtCaption(e: { tick: number; type: string; payload: unknown }): string {
  const p = (e.payload ?? {}) as Record<string, unknown>
  switch (e.type) {
    case 'intent:start': return `t${e.tick} · runs off toward the goal`
    case 'intent:blocked': return `t${e.tick} · WHAM! blocked by the wall`
    case 'reaction:run': return `t${e.tick} · onBlocked reaction fires`
    case 'cue:strikePose': return `t${e.tick} · flourish! (${p.ref})`
    case 'intent:sfx': return `t${e.tick} · *${p.kind}*`
    case 'jump:launch': return `t${e.tick} · leaps into the air`
    case 'jump:land': return `t${e.tick} · touches down`
    case 'intent:say': return `t${e.tick} · says “${p.text}”`
    case 'intent:impulse': { const v = p.vec as [number, number]; return `t${e.tick} · knocked back (${v[0].toFixed(0)}, ${v[1].toFixed(0)})` }
    case 'intent:arrived': return `t${e.tick} · arrives, safe and sound`
    case 'behavior:ended': return `t${e.tick} · behavior ends (${p.reason})`
    case 'behavior:complete': return `t${e.tick} · behavior complete`
    default: return `t${e.tick} · ${e.type}`
  }
}

function traceOf(s: Scenario): { tick: number; type: string; payload: unknown }[] {
  return s.ctx.events.trace().filter((e) => REPORTED.has(e.type)) as { tick: number; type: string; payload: unknown }[]
}
function captionsOf(actor: Actor | Scenario): { tick: number; type: string; payload: unknown }[] {
  return actor.ctx.events.trace().filter((e) => CAPTION.has(e.type)) as { tick: number; type: string; payload: unknown }[]
}
function jumpTick(s: Scenario, type: 'jump:launch' | 'jump:land'): number | null {
  const e = s.ctx.events.trace().find((ev) => ev.type === type)
  return e ? e.tick : null
}

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
  return 3.4
}

/** A comic speech bubble above the head, drawn from rt.speech(). */
function SpeechBubble({ rt }: { rt: CharacterRuntime }): ReactElement | null {
  const sp = rt.speech()
  if (!sp) return null
  const sk = rt.solved()
  const head = sk.bones.find((b) => b.id === 'head')
  if (!head) return null
  const cx = head.ex
  const topY = head.ey - 18 // above the head circle
  const text = sp.text
  const wBub = Math.max(46, text.length * 8.5 + 20)
  const hBub = 26
  const bx = cx - wBub / 2
  const by = topY - hBub - 10
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={bx} y={by} width={wBub} height={hBub} rx={9} ry={9} fill="#ffffff" stroke={INK} strokeWidth={2} />
      <path d={`M ${cx - 6} ${by + hBub} L ${cx + 2} ${topY - 2} L ${cx + 8} ${by + hBub} Z`} fill="#ffffff" stroke={INK} strokeWidth={2} />
      <line x1={cx - 6} y1={by + hBub} x2={cx + 8} y2={by + hBub} stroke="#ffffff" strokeWidth={2.5} />
      <text x={cx} y={by + hBub / 2 + 5} textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize={15} fontWeight={700} fill={INK}>{text}</text>
    </g>
  )
}

function Character({ rt }: { rt: CharacterRuntime }): ReactElement {
  const sk = rt.solved()
  const head = sk.bones.find((b) => b.id === 'head')
  const neck = sk.bones.find((b) => b.id === 'neck')
  const overrides = rt.overrides()
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
      <SpeechBubble rt={rt} />
    </g>
  )
}

// ── a single review panel (used by walltest x2 and the built-in modes) ──────────────
function ReviewPanel({ actor, vb, w, h, title, caption }: { actor: Actor; vb: string; w: number; h: number; title: string; caption: string }): ReactElement {
  const cw = actor.mw.collision()
  const cap: Capsule = actor.rt.capsule()
  const caps = captionsOf(actor).slice(-7)
  return (
    <div style={{ display: 'inline-block', verticalAlign: 'top', margin: '0 10px 0 0' }}>
      <div style={{ font: '600 13px system-ui', margin: '0 0 4px' }}>{title}</div>
      <svg viewBox={vb} width={w} height={h} data-strip={`panel-${caption}`} style={{ background: '#faf7ee', border: '1px solid #d8d2c2' }}>
        {cw.panels.map((p) => (
          <rect key={p.entity} x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} fill={PAPER} stroke="#b9b2a0" strokeWidth={1.5} />
        ))}
        <line x1={cap.x0} y1={cap.y0} x2={cap.x1} y2={cap.y1} stroke="#1c7ed6" strokeWidth={cap.r * 2} strokeLinecap="round" opacity={0.22} />
        {actor.markers.map((m) => (
          <g key={m.id}>
            <circle cx={m.x} cy={m.y} r={7} fill="none" stroke="#e03131" strokeWidth={2.4} />
            <circle cx={m.x} cy={m.y} r={2} fill="#e03131" />
          </g>
        ))}
        <Character rt={actor.rt} />
      </svg>
      <div data-caption={caption} style={{ width: w, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {caps.length === 0 && <div style={captionBox}>…</div>}
        {caps.map((e, i) => (
          <div key={i} style={captionBox}>{fmtCaption(e)}</div>
        ))}
      </div>
    </div>
  )
}

const captionBox: CSSProperties = {
  font: '600 11px ui-monospace, monospace',
  background: '#fff',
  border: '1.5px solid #1a1a1a',
  borderRadius: 3,
  padding: '3px 7px',
  boxShadow: '2px 2px 0 rgba(0,0,0,0.12)',
}

// ── app ───────────────────────────────────────────────────────────────────────────
function App(): ReactElement {
  const [which, setWhich] = useState<Which>('walltest')
  const [, force] = useState(0)
  const rerender = (): void => force((n) => (n + 1) & 0xffff)
  const scenRef = useRef<Scenario | null>(null)
  // paused persists across the mode-change effect restart, so a screenshot script that
  // calls pause() then stepN() is never overtaken by the live rAF loop.
  const pausedRef = useRef(false)

  useMemo(() => {
    scenRef.current?.rt.dispose()
    scenRef.current?.right?.rt.dispose()
    scenRef.current = buildScenario(which)
  }, [which])

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      raf = requestAnimationFrame(loop)
      if (pausedRef.current) return
      const s = scenRef.current
      if (s) { stepOnce(s); rerender() }
    }
    raf = requestAnimationFrame(loop)

    const rebuild = (w: Which): void => { scenRef.current?.rt.dispose(); scenRef.current?.right?.rt.dispose(); scenRef.current = buildScenario(w) }
    const B = {
      run(w: Which): void { pausedRef.current = true; rebuild(w); setWhich(w); rerender() },
      pause(): void { pausedRef.current = true },
      resume(): void { pausedRef.current = false },
      stepN(n: number): void { const s = scenRef.current; if (!s) return; for (let i = 0; i < n; i++) stepOnce(s); rerender() },
      get which(): Which { return scenRef.current?.which ?? which },
      get tick(): number { return scenRef.current?.tick ?? 0 },
      get totalTicks(): number { return scenRef.current?.tick ?? 0 },
      mode(): string { return scenRef.current?.rt.locomotion.mode ?? 'idle' },
      status(): string { return scenRef.current?.rt.locomotion.status ?? 'idle' },
      running(): boolean { return scenRef.current?.rt.running() ?? false },
      bothDone(): boolean { const s = scenRef.current; return s ? !s.rt.running() && !(s.right?.rt.running() ?? false) : true },
      readout(): string { const s = scenRef.current; return s ? readoutText(s) : '' },
      launchTick(): number | null { const s = scenRef.current; return s ? jumpTick(s, 'jump:launch') : null },
      landTick(): number | null { const s = scenRef.current; return s ? jumpTick(s, 'jump:land') : null },
    }
    ;(window as unknown as { __behavior: typeof B }).__behavior = B
    return () => { cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [which])

  const s = scenRef.current
  if (!s) return <div />

  const modeButtons = (
    <div>
      {(['walltest', 'hop', 'vault', 'tightrope', 'walk', 'jump', 'blocked', 'fly'] as Which[]).map((w) => (
        <button key={w} data-run={w} data-active={which === w ? '' : undefined} onClick={() => setWhich(w)}>
          {w === 'walltest' ? 'WALL TEST (both)' : w === 'walk' ? 'Walk to far panel' : w === 'jump' ? 'Jump to roof' : w === 'blocked' ? 'Walk into a wall' : w === 'fly' ? 'Fly (bird)' : w}
        </button>
      ))}
    </div>
  )

  // ── PHASE 7b layouts ─────────────────────────────────────────────────────────────
  if (which === 'walltest') {
    const leftActor: Actor = { ctx: s.ctx, verlet: s.verlet, mw: s.mw, rt: s.rt, markers: s.markers, trail: s.trail }
    const panelVB = '40 60 460 300'
    return (
      <section>
        {modeButtons}
        <div className="box" data-strip="behavior" style={{ padding: 12, whiteSpace: 'nowrap' }}>
          <ReviewPanel actor={leftActor} vb={panelVB} w={470} h={306} title="A · ENCLOSED — runs into the wall → bonk reaction" caption="left" />
          {s.right && <ReviewPanel actor={s.right} vb={panelVB} w={470} h={306} title="B · OUTSIDE — same doc → clean traversal, no reaction" caption="right" />}
        </div>
      </section>
    )
  }

  if (which === 'hop' || which === 'vault' || which === 'tightrope') {
    const actor: Actor = { ctx: s.ctx, verlet: s.verlet, mw: s.mw, rt: s.rt, markers: s.markers, trail: s.trail }
    return (
      <section>
        {modeButtons}
        <div className="box" data-strip="behavior" style={{ padding: 12 }}>
          <ReviewPanel actor={actor} vb="40 150 760 320" w={860} h={362} title={`Built-in: ${which}`} caption={which} />
        </div>
      </section>
    )
  }

  // ── PHASE 7a layout (unchanged) ────────────────────────────────────────────────────
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
      {modeButtons}
      <div className="box">
        <svg viewBox={VB} width={W} height={H} data-strip="behavior" style={{ background: '#faf7ee' }}>
          {cw.panels.map((p) => (
            <rect key={p.entity} x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} fill={PAPER} stroke="#b9b2a0" strokeWidth={1.5} />
          ))}
          {g.edges.map((e, i) => {
            const a = nodeById.get(e.from)
            const b = nodeById.get(e.to)
            if (!a || !b) return null
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE_COLOR[e.type] ?? '#999'} strokeWidth={e.type === 'walk' ? 2.5 : e.type === 'hop' ? 1.8 : 1} strokeOpacity={e.type === 'jump' ? 0.4 : 0.85} />
          })}
          {g.nodes.map((n) => (
            <circle key={n.id} cx={n.x} cy={n.y} r={n.kind === 'interior' ? 4 : 3.2} fill={n.kind === 'interior' ? INK : '#e8590c'} stroke="#fff" strokeWidth={1} />
          ))}
          {path.length > 1 && (
            <>
              <polyline points={path.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={PATH_COLOR} strokeWidth={4} strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 8" />
              {path.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4.5} fill={PATH_COLOR} stroke="#fff" strokeWidth={1.2} />)}
            </>
          )}
          {which === 'fly' && s.trail.length > 1 && (
            <polyline points={s.trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={TRAIL_COLOR} strokeWidth={3} strokeOpacity={0.5} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {s.markers.map((m) => (
            <g key={m.id}>
              <circle cx={m.x} cy={m.y} r={7} fill="none" stroke={m.role === 'goal' ? '#e03131' : TRAIL_COLOR} strokeWidth={2.4} />
              <circle cx={m.x} cy={m.y} r={2} fill={m.role === 'goal' ? '#e03131' : TRAIL_COLOR} />
            </g>
          ))}
          {showCapsule && (
            <line x1={cap.x0} y1={cap.y0} x2={cap.x1} y2={cap.y1} stroke="#1c7ed6" strokeWidth={cap.r * 2} strokeLinecap="round" opacity={0.28} />
          )}
          <Character rt={s.rt} />
        </svg>
        <div className="readout" data-readout>{readoutText(s)}</div>
      </div>
    </section>
  )
}

function readoutText(s: Scenario): string {
  const header = `${s.which}  ·  mode=${s.rt.locomotion.mode}  ·  status=${s.rt.locomotion.status}  ·  running=${s.rt.running()}  ·  tick ${s.tick}`
  if (isNew(s.which)) {
    const left = captionsOf(s).slice(-6).map(fmtEvent)
    const right = s.right ? captionsOf(s.right).slice(-6).map(fmtEvent) : []
    return [header, 'LEFT:', ...left, ...(s.right ? ['RIGHT:', ...right] : [])].join('\n')
  }
  const tr = traceOf(s)
  const recent = tr.slice(-5).map(fmtEvent)
  return [header, ...recent].join('\n')
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
