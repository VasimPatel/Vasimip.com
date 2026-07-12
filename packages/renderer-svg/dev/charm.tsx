// Dev-only CHARM CHECKPOINT page (owner directive 2026-07-11) — the legacy Dash
// (live, with his real CSS idle/cape/blink animations) beside the engine Dash
// wearing the full charm layer: legacy face language (dark pupils, brows, mouth),
// bandana ribbon on the shared verlet, limb polylines with the legacy stroke
// weights, squash & stretch, hanging-arm gait, expression acting. NOT part of the
// prod build — nothing in src/ imports it.

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import {
  createCharacterRuntime,
  createContext,
  createMutableWorld,
  createVerletWorld,
  panelEdges,
  STEP_MS,
  type CharacterRuntime,
  type EngineContext,
  type MutableWorld,
  type VerletWorld,
} from '../../engine/src/index'
import { createCharacterRenderer, type CharacterRenderer } from '../src/index'
import type { BehaviorDoc, CharacterDoc, Clip, Pose, RigTemplate, WorldDocV2 } from '../../schema/src/index'

import rigJson from '../../../content/engine/rig.dash.json'
import characterJson from '../../../content/engine/character.dash.json'
import jumpClip from '../../../content/engine/clips/jump.json'
import idleClip from '../../../content/engine/clips/idle-shuffle.json'
import walkClip from '../../../content/engine/clips/walk-cycle.json'
import standPose from '../../../content/engine/poses/stand.json'
import cheerPose from '../../../content/engine/poses/cheer.json'
import thinkPose from '../../../content/engine/poses/think.json'
import squashPose from '../../../content/engine/poses/squash-land.json'
import tuckPose from '../../../content/engine/poses/jump-tuck.json'

// The LIVE legacy reference — real components, real CSS keyframes.
import LegacyIdle from '../../../src/notebook/poses/Idle'
import '../../../src/notebook/styles.css'

const rig = rigJson as unknown as RigTemplate
const character = characterJson as unknown as CharacterDoc
const clips: Record<string, Clip> = {
  jump: jumpClip as unknown as Clip,
  'idle-shuffle': idleClip as unknown as Clip,
  'walk-cycle': walkClip as unknown as Clip,
}
const poses: Record<string, Pose> = {
  stand: standPose as unknown as Pose,
  cheer: cheerPose as unknown as Pose,
  think: thinkPose as unknown as Pose,
  'squash-land': squashPose as unknown as Pose,
  'jump-tuck': tuckPose as unknown as Pose,
}

// ── the stage: one wide paper panel; goals are invisible marker entities ─────────
const FLOOR_Y = 178
const BOX = { x: -50, y: FLOOR_Y, w: 600, h: 110 }
function stageWorld(): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 7,
    entities: [
      {
        id: 'stage',
        components: {
          transform: { x: BOX.x, y: BOX.y },
          surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: 0 } },
          collidable: { shape: 'segments', segments: panelEdges(BOX) },
        },
      },
      { id: 'goalL', components: { transform: { x: 40, y: FLOOR_Y } } },
      { id: 'goalR', components: { transform: { x: 430, y: FLOOR_Y } } },
      { id: 'hopSpot', components: { transform: { x: 330, y: FLOOR_Y } } },
    ],
  }
}

const STROLL: BehaviorDoc = {
  schemaVersion: 2,
  id: 'stroll',
  steps: [
    { verb: 'moveTo', target: 'entity:goalR' },
    { verb: 'wait', ms: 500 },
    { verb: 'moveTo', target: 'entity:goalL' },
    { verb: 'wait', ms: 500 },
  ],
} as unknown as BehaviorDoc

const HOP: BehaviorDoc = {
  schemaVersion: 2,
  id: 'hop',
  steps: [{ verb: 'jumpTo', target: 'entity:hopSpot' }],
} as unknown as BehaviorDoc

const SAY: BehaviorDoc = {
  schemaVersion: 2,
  id: 'say-hi',
  steps: [
    { verb: 'say', text: 'hi there!' },
    { verb: 'strikePose', ref: 'cheer', holdMs: 900 },
  ],
} as unknown as BehaviorDoc

interface Scene {
  ctx: EngineContext
  verlet: VerletWorld
  mw: MutableWorld
  rt: CharacterRuntime
  mode: 'idle' | 'stroll' | 'hop' | 'say'
}

function buildScene(): Scene {
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(stageWorld(), { character, events: ctx.events, stepMs: STEP_MS })
  const rt = createCharacterRuntime({
    rig,
    character,
    world: mw,
    verlet,
    rng: ctx.rng,
    events: ctx.events,
    clips,
    poses,
    names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
    restPose: poses.stand,
    initialTransform: { x: 120, y: 60, rot: 0, facing: 1 },
    accessories: true, // the bandana
    getLookTarget: () => look.current,
  })
  // Feet on the floor.
  const cap = rt.capsule()
  rt.transform.y += FLOOR_Y - (cap.y1 + cap.r)
  return { ctx, verlet, mw, rt, mode: 'idle' }
}

const look = { current: null as { x: number; y: number } | null }

function App() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  const bubbleRef = useRef<SVGGElement | null>(null)
  const [, force] = useState(0)

  // Legacy look-tracking (approximates the real site's cursor feel).
  const [legacyLook, setLegacyLook] = useState({ headTilt: 0, lookXf: 0, lookY: 0 })

  useEffect(() => {
    const svg = svgRef.current!
    const scene = buildScene()
    sceneRef.current = scene
    rendererRef.current = createCharacterRenderer(svg, character, rig)

    // Speech bubble (imperative, follows the head).
    const SVG_NS = 'http://www.w3.org/2000/svg'
    const bubble = document.createElementNS(SVG_NS, 'g') as SVGGElement
    const brect = document.createElementNS(SVG_NS, 'rect')
    brect.setAttribute('rx', '7')
    brect.setAttribute('fill', '#fffdf6')
    brect.setAttribute('stroke', '#1a1a1a')
    brect.setAttribute('stroke-width', '2.5')
    const btext = document.createElementNS(SVG_NS, 'text')
    btext.setAttribute('font-size', '14')
    btext.setAttribute('font-family', 'inherit')
    btext.setAttribute('font-weight', '700')
    bubble.appendChild(brect)
    bubble.appendChild(btext)
    bubble.style.display = 'none'
    svg.appendChild(bubble)
    bubbleRef.current = bubble

    // Rerun looping modes when a behavior finishes.
    scene.ctx.events.on('behavior:complete', () => {
      const s = sceneRef.current
      if (!s) return
      if (s.mode === 'stroll') s.rt.runBehavior(STROLL)
      else s.mode = 'idle'
    })

    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      acc += Math.min(120, now - last)
      last = now
      const s = sceneRef.current
      const r = rendererRef.current
      if (!s || !r) return
      while (acc >= STEP_MS) {
        acc -= STEP_MS
        s.ctx.clock.advance()
        s.rt.tick()
        s.verlet.step()
        s.mw.stepMutations()
      }
      r.render(s.rt.solved(), s.rt.face(), s.rt.overrides(), {
        flourish: s.rt.flourish(),
        accessories: s.rt.accessories.map((a) => a.points()),
      })
      // Bubble.
      const sp = s.rt.speech()
      const b = bubbleRef.current!
      if (sp) {
        const head = s.rt.solved().bones.find((bn) => bn.id === 'head')
        if (head) {
          const tx = head.ex + 16
          const ty = head.ey - 34
          const text = b.children[1] as SVGTextElement
          text.textContent = sp.text
          text.setAttribute('x', String(tx + 9))
          text.setAttribute('y', String(ty + 17))
          const w = sp.text.length * 7.6 + 18
          const rect = b.children[0] as SVGRectElement
          rect.setAttribute('x', String(tx))
          rect.setAttribute('y', String(ty))
          rect.setAttribute('width', String(w))
          rect.setAttribute('height', '25')
          b.style.display = ''
        }
      } else {
        b.style.display = 'none'
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      rendererRef.current?.destroy()
      rendererRef.current = null
      bubble.remove()
      sceneRef.current = null
    }
  }, [])

  function onEngineMouse(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current!
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    look.current = { x: pt.x, y: pt.y }
  }

  function onLegacyMouse(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget.getBoundingClientRect()
    const nx = ((e.clientX - el.left) / el.width) * 2 - 1
    const ny = ((e.clientY - el.top) / el.height) * 2 - 1
    setLegacyLook({ headTilt: nx * 7, lookXf: nx * 3, lookY: ny * 2 })
  }

  function run(mode: Scene['mode'], doc?: BehaviorDoc) {
    const s = sceneRef.current
    if (!s) return
    s.mode = mode
    if (doc) s.rt.runBehavior(doc)
    force((n) => n + 1)
  }

  function poke() {
    const s = sceneRef.current
    if (!s) return
    s.ctx.events.emit('expression:poke', { characterId: character.id })
    s.verlet.applyImpulse(`secondary:${character.id}`, 90, -160)
    for (const a of s.rt.accessories) s.verlet.applyImpulse(a.bodyId, 140, -120)
  }

  return (
    <div>
      <h1>Charm checkpoint</h1>
      <div className="sub">
        Left: the legacy Dash, live (his real CSS animations). Right: the engine Dash wearing the charm layer —
        move your cursor over either panel and both track it. Judge: eyes, attitude, bandana, walk, landing.
      </div>
      <div className="row">
        <div className="panel legacy" onMouseMove={onLegacyMouse}>
          <h2>THE ORIGINAL</h2>
          <svg viewBox="-70 -78 140 150" width={296} height={318}>
            <g>
              <LegacyIdle headTilt={legacyLook.headTilt} lookXf={legacyLook.lookXf} lookY={legacyLook.lookY} eyeR={2.6} />
            </g>
          </svg>
        </div>
        <div className="panel engine">
          <h2>THE ENGINE</h2>
          <svg ref={svgRef} viewBox="-30 -20 520 260" width="100%" onMouseMove={onEngineMouse}>
            <line x1={BOX.x} y1={FLOOR_Y} x2={BOX.x + BOX.w} y2={FLOOR_Y} stroke="#b9b2a2" strokeWidth={2.5} strokeDasharray="1 0" />
          </svg>
          <div className="btns">
            <button onClick={() => run('stroll', STROLL)}>stroll</button>
            <button onClick={() => run('hop', HOP)}>hop</button>
            <button onClick={() => run('say', SAY)}>say hi</button>
            <button onClick={poke}>poke</button>
            <button onClick={() => run('idle')}>idle</button>
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
