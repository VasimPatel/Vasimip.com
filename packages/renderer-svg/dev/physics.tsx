// Dev-only Phase 5 "physics" review (NOT part of the prod build — nothing in src/
// imports it). Deterministic screenshot strips + live panels for the shared verlet
// solver (L3):
//  • SECONDARY — a fast pose change (stand→cheer) sampled 6× so the forearm/head
//    lag → overshoot → settle is visible; grey ghost = pure FK target, colour = the
//    verlet-overridden bones (the follow-through gap).
//  • PROPS — a row of three props (soft/medium/stiff) impulsed at t=0, sampled over
//    time: wobble decays, each comes home, the sleep dot hollows when it sleeps.
//  • ROPE — taut / sagging (slack) / loaded (a weight sags it further).
// Live panels: drag the character (pins the nearest secondary end), a "fast pose"
// button, click-to-impulse props, and a draggable rope weight.
// Served via:  ~/.bun/bin/bunx vite packages/renderer-svg/dev --port 5197  → /physics.html
import { StrictMode, useEffect, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import {
  createBlender,
  createControllerSet,
  createRng,
  createVerletWorld,
  createSecondary,
  solveFk,
  createLoop,
  STEP_MS,
  NEUTRAL_FACE,
  type FaceAux,
  type SolvedSkeleton,
  type VerletWorld,
} from '../../engine/src/index'
import { createCharacterRenderer, createPropRenderer, createRopeRenderer, type EndpointOverrides } from '../src/index'
import { tryValidateRig, tryValidateCharacter, validatePoseAgainstRig } from '../../schema/src/index'

import rigDoc from '../../../content/engine/rig.dash.json'
import characterDoc from '../../../content/engine/character.dash.json'
import standPoseDoc from '../../../content/engine/poses/stand.json'
import cheerPoseDoc from '../../../content/engine/poses/cheer.json'

const NS = 'http://www.w3.org/2000/svg'

const rigR = tryValidateRig(rigDoc)
if (!rigR.ok) throw new Error('rig invalid: ' + rigR.errors.join('; '))
const rig = rigR.doc
const charR = tryValidateCharacter(characterDoc)
if (!charR.ok) throw new Error('character invalid: ' + charR.errors.join('; '))
const character = charR.doc
const standR = validatePoseAgainstRig(standPoseDoc, rig)
if (!standR.ok) throw new Error('stand invalid: ' + standR.errors.join('; '))
const stand = standR.doc
const cheerR = validatePoseAgainstRig(cheerPoseDoc, rig)
if (!cheerR.ok) throw new Error('cheer invalid: ' + cheerR.errors.join('; '))
const cheer = cheerR.doc
const props = character.proportions

const ghostChar = { ...character, style: { ...(character.style ?? { color: '#000', width: 5 }), color: '#c7bfae' } }
const accentChar = { ...character, style: { ...(character.style ?? { color: '#000', width: 5 }), color: '#e03131' } }

// ── SECONDARY strip: fast pose change, follow-through sampled 6× ─────────────────
interface SecFrame {
  tick: number
  label: string
  solved: SolvedSkeleton
  overrides: EndpointOverrides
  face: FaceAux
}
function sampleSecondary(): SecFrame[] {
  // Isolate the L3 follow-through: SNAP the FK pose stand→cheer at the trigger (no
  // blender smoothing) so the ONLY lag on screen is the verlet secondary. Grey = the
  // FK target the arms/head jump to; red = the verlet ends trailing then overshooting
  // then settling onto it. (The live panel below uses the real blender-smoothed path.)
  const world = createVerletWorld()
  const secondary = createSecondary(rig, world, { proportions: props, id: 'secondary' })
  const TRIGGER = 8
  const sampleTicks = [TRIGGER - 2, TRIGGER + 3, TRIGGER + 8, TRIGGER + 16, TRIGGER + 34, TRIGGER + 80]
  const maxTick = sampleTicks[sampleTicks.length - 1]
  const frames: SecFrame[] = []
  for (let t = 0; t <= maxTick; t++) {
    const pose = t < TRIGGER ? stand : cheer
    const solved = solveFk(rig, { id: 's', angles: pose.angles }, { proportions: props, rootTransform: pose.root })
    secondary.step(solved)
    world.step()
    if (sampleTicks.includes(t)) {
      const ov = secondary.overrides()
      const copy: EndpointOverrides = {}
      for (const k of Object.keys(ov)) copy[k] = { ex: ov[k].ex, ey: ov[k].ey }
      const label = t < TRIGGER ? 'pre' : t === TRIGGER ? 'snap' : `+${Math.round((t - TRIGGER) * STEP_MS)}ms`
      frames.push({ tick: t, label, solved, overrides: copy, face: NEUTRAL_FACE })
    }
  }
  return frames
}

// ── PROPS strip: 3 classes impulsed, sampled over time + sleep dots ─────────────
interface PropSample {
  ms: number
  bars: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; asleep: boolean }>
}
const PROP_CLASSES = ['soft', 'medium', 'stiff'] as const
const PROP_W = 26
function sampleProps(): PropSample[] {
  const world = createVerletWorld()
  const ids = PROP_CLASSES.map((cls, i) => {
    const id = `p${i}`
    world.addProp(id, { x: (i - 1) * 46, y: 0, w: PROP_W, h: 9, stiffnessClass: cls })
    return id
  })
  const handles = ids.map((id) => world.bodyHandle(id)!)
  for (const id of ids) world.applyImpulse(id, 120, -300)
  const sampleTicks = [3, 12, 28, 60, 140, 320]
  const maxTick = sampleTicks[sampleTicks.length - 1]
  const out: PropSample[] = []
  for (let t = 1; t <= maxTick; t++) {
    world.step()
    if (sampleTicks.includes(t)) {
      out.push({
        ms: Math.round(t * STEP_MS),
        bars: handles.map((h, i) => ({
          a: world.particle(h.particleIds[0]),
          b: world.particle(h.particleIds[1]),
          asleep: world.isAsleep(ids[i]),
        })),
      })
    }
  }
  return out
}

// ── ROPE strip: taut / sagging / loaded ─────────────────────────────────────────
function sampleRope(kind: 'taut' | 'sag' | 'load'): Array<{ x: number; y: number }> {
  const world = createVerletWorld()
  world.addRope('r', { ax: -110, ay: -30, bx: 110, by: -30, particles: 16, slack: kind === 'taut' ? 0.01 : 0.28 })
  if (kind === 'load') world.loadRope('r', 20, 8)
  for (let t = 0; t < 400; t++) world.step()
  return world.ropePoints('r').map((p) => ({ x: p.x, y: p.y }))
}

const SEC = sampleSecondary()
const PROPS_STRIP = sampleProps()
const ROPE_TAUT = sampleRope('taut')
const ROPE_SAG = sampleRope('sag')
const ROPE_LOAD = sampleRope('load')

// ── figure w/ ghost (FK) + main (verlet overrides) ──────────────────────────────
function SecFig(p: { frame: SecFrame; vb: [number, number, number, number]; w: number; h: number }): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const gr = createCharacterRenderer(svg, ghostChar, rig)
    gr.render(p.frame.solved) // pure FK (no overrides) — the target the verlet lags
    const mr = createCharacterRenderer(svg, accentChar, rig)
    mr.render(p.frame.solved, p.frame.face, p.frame.overrides) // verlet follow-through
    return () => {
      gr.destroy()
      mr.destroy()
    }
  })
  return <svg ref={ref} viewBox={p.vb.join(' ')} width={p.w} height={p.h} style={{ overflow: 'visible' }} data-tick />
}

function PropsFig(p: { sample: PropSample; vb: [number, number, number, number]; w: number; h: number }): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const rends = p.sample.bars.map(() => createPropRenderer(svg, { w: PROP_W, h: 9 }))
    p.sample.bars.forEach((bar, i) => rends[i].render(bar.a, bar.b, bar.asleep))
    return () => rends.forEach((r) => r.destroy())
  })
  return <svg ref={ref} viewBox={p.vb.join(' ')} width={p.w} height={p.h} style={{ overflow: 'visible' }} data-tick />
}

function RopeFig(p: { points: Array<{ x: number; y: number }>; loaded?: boolean }): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const rr = createRopeRenderer(svg)
    rr.render(p.points)
    const anchors: SVGCircleElement[] = []
    for (const end of [p.points[0], p.points[p.points.length - 1]]) {
      const c = document.createElementNS(NS, 'circle')
      c.setAttribute('cx', String(end.x))
      c.setAttribute('cy', String(end.y))
      c.setAttribute('r', '3')
      c.setAttribute('fill', '#1a1a1a')
      svg.appendChild(c)
      anchors.push(c)
    }
    return () => {
      rr.destroy()
      anchors.forEach((a) => a.remove())
    }
  })
  return <svg ref={ref} viewBox="-130 -55 260 120" width={230} height={106} style={{ overflow: 'visible' }} data-tick />
}

// ── live panels ──────────────────────────────────────────────────────────────────
function LiveCharacter(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  const poseRef = useRef<'stand' | 'cheer'>('stand')
  const [pose, setPose] = useState<'stand' | 'cheer'>('stand')
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const world = createVerletWorld()
    const blender = createBlender(rig, { initialPose: stand })
    const set = createControllerSet(blender, rig, character, { rng: createRng(7) })
    const secondary = createSecondary(rig, world, { proportions: props, id: 'secondary' })
    const renderer = createCharacterRenderer(svg, character, rig)
    let tick = 0
    let want: 'stand' | 'cheer' = 'stand'
    let dragPid = -1

    // pointer drag → pin nearest secondary end
    const svgPoint = (ev: PointerEvent): { x: number; y: number } => {
      const r = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height }
    }
    const down = (ev: PointerEvent): void => {
      const pt = svgPoint(ev)
      let best = -1
      let bestD = 24
      for (const id of ['foreArmL', 'foreArmR', 'head']) {
        const pid = secondary.endParticleId(id)
        if (pid === undefined) continue
        const pp = world.particle(pid)
        const d = Math.hypot(pp.x - pt.x, pp.y - pt.y)
        if (d < bestD) {
          bestD = d
          best = pid
        }
      }
      if (best >= 0) {
        dragPid = best
        world.setPin(dragPid, pt.x, pt.y)
        svg.setPointerCapture(ev.pointerId)
      }
    }
    const move = (ev: PointerEvent): void => {
      if (dragPid < 0) return
      const pt = svgPoint(ev)
      world.setPin(dragPid, pt.x, pt.y)
    }
    const up = (): void => {
      if (dragPid >= 0) world.unpin(dragPid)
      dragPid = -1
    }
    svg.addEventListener('pointerdown', down)
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', up)

    const loop = createLoop(() => {
      if (poseRef.current !== want) {
        want = poseRef.current
        blender.setSource(want === 'cheer' ? cheer : stand, { durationMs: 200 })
      }
      const face = set.update(tick++)
      const { pose: p } = blender.tick()
      const solved = solveFk(rig, { id: 'live', angles: p.angles }, { proportions: props, rootTransform: p.root })
      set.feedSolved(solved)
      secondary.step(solved)
      world.step()
      renderer.render(solved, face, secondary.overrides())
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
    return () => {
      cancelAnimationFrame(raf)
      svg.removeEventListener('pointerdown', down)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerup', up)
      set.dispose()
      renderer.destroy()
    }
  }, [])
  return (
    <div>
      <button
        onClick={() => {
          const next = pose === 'stand' ? 'cheer' : 'stand'
          poseRef.current = next
          setPose(next)
        }}
      >
        fast pose → {pose === 'stand' ? 'cheer' : 'stand'}
      </button>
      <div className="meta">drag a forearm or the head — limbs trail, release to settle</div>
      <svg ref={ref} viewBox="-80 -100 160 210" width={190} height={249} style={{ overflow: 'visible', touchAction: 'none' }} />
    </div>
  )
}

function LiveProps(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  const worldRef = useRef<VerletWorld | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const world = createVerletWorld()
    worldRef.current = world
    const ids = PROP_CLASSES.map((cls, i) => {
      const id = `p${i}`
      world.addProp(id, { x: (i - 1) * 60, y: 0, w: PROP_W, h: 10, stiffnessClass: cls })
      return id
    })
    const handles = ids.map((id) => world.bodyHandle(id)!)
    const rends = handles.map(() => createPropRenderer(svg, { w: PROP_W, h: 10 }))
    const loop = createLoop(() => {
      world.step()
      handles.forEach((h, i) => rends[i].render(world.particle(h.particleIds[0]), world.particle(h.particleIds[1]), world.isAsleep(ids[i])))
    })
    const click = (ev: MouseEvent): void => {
      const r = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      const x = vb.x + ((ev.clientX - r.left) / r.width) * vb.width
      let best = ids[0]
      let bestD = Infinity
      handles.forEach((h, i) => {
        const c = (world.particle(h.particleIds[0]).x + world.particle(h.particleIds[1]).x) / 2
        const d = Math.abs(c - x)
        if (d < bestD) {
          bestD = d
          best = ids[i]
        }
      })
      world.applyImpulse(best, 80, -320)
    }
    svg.addEventListener('click', click)
    let raf = 0
    let last = 0
    const frame = (now: number): void => {
      if (last === 0) last = now
      loop.advance(now - last)
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      svg.removeEventListener('click', click)
      rends.forEach((r) => r.destroy())
    }
  }, [])
  return (
    <div>
      <div className="meta">click a prop to poke it — filled dot = awake, hollow = asleep</div>
      <svg ref={ref} viewBox="-110 -50 220 90" width={300} height={123} style={{ overflow: 'visible' }} />
    </div>
  )
}

function LiveRope(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const world = createVerletWorld()
    world.addRope('r', { ax: -120, ay: -30, bx: 120, by: -30, particles: 18, slack: 0.28 })
    world.loadRope('r', 0, 3)
    const rr = createRopeRenderer(svg)
    // draggable weight: pin the middle chain node to the pointer while dragging
    const chain = world.bodyHandle('r')!.particleIds
    const midPid = chain[Math.floor(chain.length / 2)]
    let dragging = false
    const svgPoint = (ev: PointerEvent): { x: number; y: number } => {
      const r = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height }
    }
    const down = (ev: PointerEvent): void => {
      dragging = true
      world.setPin(midPid, svgPoint(ev).x, svgPoint(ev).y)
      svg.setPointerCapture(ev.pointerId)
    }
    const move = (ev: PointerEvent): void => {
      if (dragging) world.setPin(midPid, svgPoint(ev).x, svgPoint(ev).y)
    }
    const up = (): void => {
      if (dragging) world.unpin(midPid)
      dragging = false
    }
    svg.addEventListener('pointerdown', down)
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', up)
    const loop = createLoop(() => {
      world.step()
      rr.render(world.ropePoints('r'))
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
    return () => {
      cancelAnimationFrame(raf)
      svg.removeEventListener('pointerdown', down)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerup', up)
      rr.destroy()
    }
  }, [])
  return (
    <div>
      <div className="meta">drag the rope down — it sags under the load and springs back</div>
      <svg ref={ref} viewBox="-140 -55 280 120" width={320} height={137} style={{ overflow: 'visible', touchAction: 'none' }} />
    </div>
  )
}

const SEC_VB: [number, number, number, number] = [-80, -100, 160, 210]
const PROP_VB: [number, number, number, number] = [-90, -46, 180, 80]

function App(): ReactElement {
  return (
    <div>
      <section data-strip="secondary">
        <h2>SECONDARY — fast pose change (stand→cheer), follow-through sampled 6×</h2>
        <div className="meta">FK pose is SNAPPED stand→cheer (no blend) to isolate L3. Grey = the FK target the arms/head jump to; red = the verlet-overridden forearms/head trailing it, then settling on — angular lag, never stretch.</div>
        <div className="strip">
          {SEC.map((f) => (
            <div className="frame" key={f.tick}>
              <SecFig frame={f} vb={SEC_VB} w={118} h={155} />
              <div className="t">{f.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section data-strip="props">
        <h2>PROPS — soft / medium / stiff impulsed at t=0, sampled over time</h2>
        <div className="meta">Left→right: soft, medium, stiff. Wobble decays and each comes home to rest; the dot hollows when the prop sleeps.</div>
        <div className="strip props">
          {PROPS_STRIP.map((s) => (
            <div className="frame" key={s.ms}>
              <PropsFig sample={s} vb={PROP_VB} w={130} h={58} />
              <div className="t">{s.ms}ms</div>
            </div>
          ))}
        </div>
      </section>

      <section data-strip="rope">
        <h2>ROPE — taut / sagging / loaded</h2>
        <div className="meta">Pinned at both ends. Slack sags under gravity; a load sags it further (P7 tightrope).</div>
        <div className="strip rope">
          <div className="frame"><RopeFig points={ROPE_TAUT} /><div className="t">taut</div></div>
          <div className="frame"><RopeFig points={ROPE_SAG} /><div className="t">slack sag</div></div>
          <div className="frame"><RopeFig points={ROPE_LOAD} loaded /><div className="t">loaded</div></div>
        </div>
      </section>

      <section>
        <h2>live</h2>
        <div className="live">
          <div className="panel"><div className="cap">character + secondary (drag / fast pose)</div><LiveCharacter /></div>
          <div className="panel"><div className="cap">props (click to poke)</div><LiveProps /></div>
          <div className="panel"><div className="cap">rope (drag the weight)</div><LiveRope /></div>
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
