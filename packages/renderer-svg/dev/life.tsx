// Dev-only Phase 4 "life" review (NOT part of the prod build — nothing in src/
// imports it). Three deterministic screenshot strips + three live panels:
//  • IDLE — blender + full controller set; a normal strip (subtle breathing) and an
//    AMPLIFIED strip (angles exaggerated ×6 vs frame 0 over a frame-0 ghost, so the
//    breathing is visible in stills).
//  • WALK — the two-bone-IK gait crossing a drawn floor line, with plant markers.
//  • LOOK — head + pupils tracking a moving dot at 6 positions; one frame mid-blink.
// Served via:  ~/.bun/bin/bunx vite packages/renderer-svg/dev --port 5197
//   then open /life.html
import { StrictMode, useEffect, useRef, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  createBlender,
  createControllerSet,
  createGait,
  createLoop,
  createRng,
  solveFk,
  wrapPi,
  STEP_MS,
  NEUTRAL_FACE,
  type FaceAux,
  type PlantedFoot,
} from '../../engine/src/index'
import { createCharacterRenderer } from '../src/index'
import { tryValidateRig, tryValidateCharacter, validatePoseAgainstRig } from '../../schema/src/index'

import rigDoc from '../../../content/engine/rig.dash.json'
import characterDoc from '../../../content/engine/character.dash.json'
import standPoseDoc from '../../../content/engine/poses/stand.json'

const NS = 'http://www.w3.org/2000/svg'
const FLOOR_Y = 60

const rigR = tryValidateRig(rigDoc)
if (!rigR.ok) throw new Error('rig invalid: ' + rigR.errors.join('; '))
const rig = rigR.doc
const charR = tryValidateCharacter(characterDoc)
if (!charR.ok) throw new Error('character invalid: ' + charR.errors.join('; '))
const character = charR.doc
const poseR = validatePoseAgainstRig(standPoseDoc, rig)
if (!poseR.ok) throw new Error('stand invalid: ' + poseR.errors.join('; '))
const stand = poseR.doc
const props = character.proportions

const ghostChar = { ...character, style: { ...(character.style ?? { color: '#000', width: 5 }), color: '#c9c2b2' } }
const ampChar = { ...character, style: { ...(character.style ?? { color: '#000', width: 5 }), color: '#e03131' } }

type PoseSample = { tick: number; angles: Record<string, number>; root: { x: number; y: number; rot: number }; face: FaceAux; planted?: PlantedFoot[]; target?: { x: number; y: number } }

// ── deterministic sampling ────────────────────────────────────────────────────
function sampleIdle(count: number, span: number): PoseSample[] {
  const blender = createBlender(rig, { initialPose: stand })
  const set = createControllerSet(blender, rig, character, { rng: createRng(7) })
  const step = Math.floor(span / (count - 1))
  const frames: PoseSample[] = []
  for (let i = 0; i <= span; i++) {
    const face = set.update(i)
    const { pose } = blender.tick()
    const solved = solveFk(rig, { id: 'i', angles: pose.angles }, { proportions: props, rootTransform: pose.root })
    set.feedSolved(solved)
    if (i % step === 0 && frames.length < count) frames.push({ tick: i, angles: { ...pose.angles }, root: { ...pose.root }, face })
  }
  return frames
}

function sampleWalk(count: number, seconds: number, speed: number): PoseSample[] {
  const gait = createGait(rig, character, { floorY: () => FLOOR_Y, speed, startX: 0, basePose: stand })
  const total = Math.round((seconds * 1000) / STEP_MS)
  const step = Math.floor(total / (count - 1))
  const frames: PoseSample[] = []
  for (let i = 0; i <= total; i++) {
    const { pose, planted } = gait.update(STEP_MS)
    if (i % step === 0 && frames.length < count) frames.push({ tick: i, angles: { ...pose.angles }, root: { ...pose.root }, face: NEUTRAL_FACE, planted: [...planted] })
  }
  return frames
}

function sampleLook(): PoseSample[] {
  const positions = [
    { x: -140, y: -50 }, { x: -70, y: 50 }, { x: 0, y: -65 },
    { x: 90, y: 25 }, { x: 140, y: -35 }, { x: 55, y: 60 },
  ]
  const sampleTicks = [78, 158, 238, 251 /* mid-blink (seed 7 blinks at 247) */, 398, 478]
  const segLen = 80
  let target = positions[0]
  const blender = createBlender(rig, { initialPose: stand })
  const set = createControllerSet(blender, rig, character, { rng: createRng(7), getTarget: () => target })
  const frames: PoseSample[] = []
  const maxTick = Math.max(...sampleTicks)
  for (let i = 0; i <= maxTick; i++) {
    target = positions[Math.min(positions.length - 1, Math.floor(i / segLen))]
    const face = set.update(i)
    const { pose } = blender.tick()
    const solved = solveFk(rig, { id: 'l', angles: pose.angles }, { proportions: props, rootTransform: pose.root })
    set.feedSolved(solved)
    const idx = sampleTicks.indexOf(i)
    if (idx >= 0) frames.push({ tick: i, angles: { ...pose.angles }, root: { ...pose.root }, face, target: { ...target } })
  }
  return frames
}

const IDLE = sampleIdle(8, 480)
const WALK = sampleWalk(8, 3, 40)
const LOOK = sampleLook()

// amplified: angles = base0 + 6·(angleN − base0), over a frame-0 ghost.
const AMP_GAIN = 6
function amplify(s: PoseSample, base: PoseSample): { angles: Record<string, number>; root: { x: number; y: number; rot: number } } {
  const angles: Record<string, number> = {}
  for (const id of Object.keys(s.angles)) angles[id] = wrapPi(base.angles[id] + AMP_GAIN * wrapPi(s.angles[id] - base.angles[id]))
  return { angles, root: { x: base.root.x, y: base.root.y + AMP_GAIN * (s.root.y - base.root.y), rot: base.root.rot } }
}

// ── figure renderer (ghost + main + floor + markers + target) ─────────────────
interface FigProps {
  angles: Record<string, number>
  root: { x: number; y: number; rot: number }
  face?: FaceAux
  ghost?: { angles: Record<string, number>; root: { x: number; y: number; rot: number } }
  floor?: { x0: number; x1: number }
  planted?: PlantedFoot[]
  target?: { x: number; y: number }
  vb: [number, number, number, number]
  w: number
  h: number
  accent?: boolean
}

function Fig(p: FigProps): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const cleanups: Array<() => void> = []
    if (p.floor) {
      const line = document.createElementNS(NS, 'line')
      line.setAttribute('x1', String(p.floor.x0))
      line.setAttribute('y1', String(FLOOR_Y))
      line.setAttribute('x2', String(p.floor.x1))
      line.setAttribute('y2', String(FLOOR_Y))
      line.setAttribute('stroke', '#1a9c5b')
      line.setAttribute('stroke-width', '1.5')
      line.setAttribute('stroke-dasharray', '4 3')
      svg.appendChild(line)
      cleanups.push(() => line.remove())
    }
    if (p.ghost) {
      const gr = createCharacterRenderer(svg, ghostChar, rig)
      gr.render(solveFk(rig, { id: 'g', angles: p.ghost.angles }, { proportions: props, rootTransform: p.ghost.root }))
      cleanups.push(() => gr.destroy())
    }
    const r = createCharacterRenderer(svg, p.accent ? ampChar : character, rig)
    r.render(solveFk(rig, { id: 'm', angles: p.angles }, { proportions: props, rootTransform: p.root }), p.face)
    cleanups.push(() => r.destroy())
    if (p.planted) {
      for (const pt of p.planted) {
        const c = document.createElementNS(NS, 'circle')
        c.setAttribute('cx', String(pt.x))
        c.setAttribute('cy', String(pt.y))
        c.setAttribute('r', '2.6')
        c.setAttribute('fill', '#12b886')
        c.setAttribute('stroke', '#0b7a56')
        svg.appendChild(c)
        cleanups.push(() => c.remove())
      }
    }
    if (p.target) {
      const c = document.createElementNS(NS, 'circle')
      c.setAttribute('cx', String(p.target.x))
      c.setAttribute('cy', String(p.target.y))
      c.setAttribute('r', '4.5')
      c.setAttribute('fill', '#e8590c')
      svg.appendChild(c)
      cleanups.push(() => c.remove())
    }
    return () => cleanups.forEach((f) => f())
  })
  return <svg ref={ref} viewBox={p.vb.join(' ')} width={p.w} height={p.h} style={{ overflow: 'visible' }} data-tick />
}

// ── live panels ───────────────────────────────────────────────────────────────
function LiveIdle(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const renderer = createCharacterRenderer(svg, character, rig)
    const blender = createBlender(rig, { initialPose: stand })
    const set = createControllerSet(blender, rig, character, { rng: createRng(7) })
    let tick = 0
    const loop = createLoop(() => {
      const face = set.update(tick++)
      const { pose } = blender.tick()
      const solved = solveFk(rig, { id: 'live', angles: pose.angles }, { proportions: props, rootTransform: pose.root })
      set.feedSolved(solved)
      renderer.render(solved, face)
    })
    let raf = 0
    let last = 0
    const frame = (now: number): void => {
      if (last === 0) last = now
      loop.advance(now - last)
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); set.dispose(); renderer.destroy() }
  }, [])
  return <svg ref={ref} viewBox="-72 -95 140 200" width={150} height={214} style={{ overflow: 'visible' }} />
}

function LiveWalk(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const renderer = createCharacterRenderer(svg, character, rig)
    const floor = document.createElementNS(NS, 'line')
    floor.setAttribute('y1', String(FLOOR_Y)); floor.setAttribute('y2', String(FLOOR_Y))
    floor.setAttribute('stroke', '#1a9c5b'); floor.setAttribute('stroke-width', '1.5'); floor.setAttribute('stroke-dasharray', '4 3')
    svg.appendChild(floor)
    let speed = 40
    let gait = createGait(rig, character, { floorY: () => FLOOR_Y, speed, startX: 0, basePose: stand })
    const loop = createLoop(() => {
      const { pose } = gait.update(STEP_MS)
      // bounce back and forth
      if (pose.root.x > 120 && speed > 0) { speed = -40; gait = createGait(rig, character, { floorY: () => FLOOR_Y, speed, startX: pose.root.x, direction: -1, basePose: stand }) }
      else if (pose.root.x < -120 && speed < 0) { speed = 40; gait = createGait(rig, character, { floorY: () => FLOOR_Y, speed, startX: pose.root.x, direction: 1, basePose: stand }) }
      const vbx = pose.root.x - 90
      svg.setAttribute('viewBox', `${vbx} -95 180 200`)
      floor.setAttribute('x1', String(vbx - 20)); floor.setAttribute('x2', String(vbx + 200))
      renderer.render(solveFk(rig, { id: 'w', angles: pose.angles }, { proportions: props, rootTransform: pose.root }))
    })
    let raf = 0, last = 0
    const frame = (now: number): void => { if (last === 0) last = now; loop.advance(now - last); last = now; raf = requestAnimationFrame(frame) }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); renderer.destroy(); floor.remove() }
  }, [])
  return <svg ref={ref} viewBox="-90 -95 180 200" width={210} height={214} style={{ overflow: 'visible' }} />
}

function LiveLook(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const renderer = createCharacterRenderer(svg, character, rig)
    const dot = document.createElementNS(NS, 'circle')
    dot.setAttribute('r', '5'); dot.setAttribute('fill', '#e8590c')
    svg.appendChild(dot)
    const blender = createBlender(rig, { initialPose: stand })
    let target = { x: 0, y: 0 }
    const set = createControllerSet(blender, rig, character, { rng: createRng(7), getTarget: () => target })
    let tick = 0
    const loop = createLoop(() => {
      const t = tick / 120
      target = { x: 150 * Math.cos(t * 1.3), y: -20 + 70 * Math.sin(t * 0.9) }
      dot.setAttribute('cx', String(target.x)); dot.setAttribute('cy', String(target.y))
      const face = set.update(tick++)
      const { pose } = blender.tick()
      const solved = solveFk(rig, { id: 'lk', angles: pose.angles }, { proportions: props, rootTransform: pose.root })
      set.feedSolved(solved)
      renderer.render(solved, face)
    })
    let raf = 0, last = 0
    const frame = (now: number): void => { if (last === 0) last = now; loop.advance(now - last); last = now; raf = requestAnimationFrame(frame) }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); set.dispose(); renderer.destroy(); dot.remove() }
  }, [])
  return <svg ref={ref} viewBox="-160 -100 320 210" width={300} height={197} style={{ overflow: 'visible' }} />
}

// ── page ──────────────────────────────────────────────────────────────────────
function App(): ReactElement {
  return (
    <div>
      <section data-strip="idle">
        <h2>IDLE — breathing / weight-shift / blink (8 frames over 4 s)</h2>
        <div className="meta">Subtle by design: pupils, shoulders, spine, hips drift. Blink squashes the eyes. See the amplified strip below to read the breathing in stills.</div>
        <div className="strip">
          {IDLE.map((s) => (
            <div className={'frame' + (s.face.blink > 0.2 ? ' blink' : '')} key={s.tick}>
              <Fig angles={s.angles} root={s.root} face={s.face} vb={[-72, -95, 140, 200]} w={118} h={169} />
              <div className="t">{Math.round((s.tick * STEP_MS))}ms</div>
            </div>
          ))}
        </div>
        <h2>IDLE — amplified ×6 vs frame 0 (ghost = rest)</h2>
        <div className="strip amp">
          {IDLE.map((s, i) => {
            const a = amplify(s, IDLE[0])
            return (
              <div className="frame" key={s.tick}>
                <Fig angles={a.angles} root={a.root} accent ghost={{ angles: IDLE[0].angles, root: IDLE[0].root }} vb={[-72, -95, 140, 200]} w={118} h={169} />
                <div className="t">{i === 0 ? 'rest' : '×6'}</div>
              </div>
            )
          })}
        </div>
      </section>

      <section data-strip="walk">
        <h2>WALK — IK gait across the floor (8 frames over 3 s, 40 px/s)</h2>
        <div className="meta">Green dashed line = floor. Green dots = planted feet (IK-locked). Camera follows the root; planted feet slide backward as the ground scrolls — the foot-lock.</div>
        <div className="strip walk">
          {WALK.map((s) => (
            <div className="frame" key={s.tick}>
              <Fig angles={s.angles} root={s.root} planted={s.planted} floor={{ x0: s.root.x - 70, x1: s.root.x + 70 }} vb={[s.root.x - 70, -95, 140, 200]} w={110} h={157} />
              <div className="t">x={Math.round(s.root.x)}</div>
            </div>
          ))}
        </div>
      </section>

      <section data-strip="look">
        <h2>LOOK — head + pupils tracking the dot (6 positions; one mid-blink)</h2>
        <div className="meta">Orange dot = target. Pupils do most of the work; the head follows subtly (clamped ±0.35 rad). The 251ms frame is caught mid-blink.</div>
        <div className="strip look">
          {LOOK.map((s) => (
            <div className={'frame' + (s.face.blink > 0.2 ? ' blink' : '')} key={s.tick}>
              <Fig angles={s.angles} root={s.root} face={s.face} target={s.target} vb={[-152, -100, 300, 210]} w={150} h={105} />
              <div className="t">{Math.round(s.tick * STEP_MS)}ms{s.face.blink > 0.2 ? ' blink' : ''}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>live</h2>
        <div className="live">
          <div className="panel"><div className="cap">idle (loop + controllers)</div><LiveIdle /></div>
          <div className="panel"><div className="cap">walk (gait, back &amp; forth)</div><LiveWalk /></div>
          <div className="panel"><div className="cap">look (tracks the dot)</div><LiveLook /></div>
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
