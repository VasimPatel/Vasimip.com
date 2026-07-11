// Dev-only Phase 5 PERF budget scene (NOT prod). THE BUDGET SCENE from ENGINE_V2 §3
// rule 3: 2 characters (full blender + controllers + secondary), 1 rope, 10 props, 4
// projectile-like free particles — all LIVE (sleeping disabled so every body is
// simulated every tick = worst case). One rAF loop; sim time (engine tick incl.
// verlet) and render-write time are measured SEPARATELY per frame and averaged over
// ~10 s, then published to window.__perf for the CDP-throttled runner to read.
// performance.now() is fine here — this is browser/dev code, outside the determinism
// lint's scope (packages/engine + packages/headless only).
import {
  createBlender,
  createControllerSet,
  createRng,
  createVerletWorld,
  createSecondary,
  solveFk,
  createLoop,
  type SolvedSkeleton,
  type FaceAux,
} from '../../engine/src/index'
import { createCharacterRenderer } from '../src/index'
import { tryValidateRig, tryValidateCharacter, validatePoseAgainstRig } from '../../schema/src/index'

import rigDoc from '../../../content/engine/rig.dash.json'
import characterDoc from '../../../content/engine/character.dash.json'
import standPoseDoc from '../../../content/engine/poses/stand.json'
import cheerPoseDoc from '../../../content/engine/poses/cheer.json'

const NS = 'http://www.w3.org/2000/svg'
const rig = (() => { const r = tryValidateRig(rigDoc); if (!r.ok) throw new Error(r.errors.join(';')); return r.doc })()
const character = (() => { const r = tryValidateCharacter(characterDoc); if (!r.ok) throw new Error(r.errors.join(';')); return r.doc })()
const stand = (() => { const r = validatePoseAgainstRig(standPoseDoc, rig); if (!r.ok) throw new Error(r.errors.join(';')); return r.doc })()
const cheer = (() => { const r = validatePoseAgainstRig(cheerPoseDoc, rig); if (!r.ok) throw new Error(r.errors.join(';')); return r.doc })()
const props = character.proportions

const svg = document.getElementById('stage') as unknown as SVGSVGElement

const world = createVerletWorld({ sleeping: false }) // worst case: everything simulates

// 2 characters
interface Char {
  id: string
  blender: ReturnType<typeof createBlender>
  set: ReturnType<typeof createControllerSet>
  secondary: ReturnType<typeof createSecondary>
  renderer: ReturnType<typeof createCharacterRenderer>
  solved: SolvedSkeleton
  face: FaceAux
  tick: number
}
function makeChar(id: string, x: number, seed: number): Char {
  const blender = createBlender(rig, { initialPose: { ...stand, root: { x, y: stand.root!.y, rot: 0 } } })
  const set = createControllerSet(blender, rig, character, { rng: createRng(seed) })
  const secondary = createSecondary(rig, world, { proportions: props, id: `secondary:${id}` })
  const renderer = createCharacterRenderer(svg, character, rig)
  return { id, blender, set, secondary, renderer, solved: solveFk(rig, stand, { proportions: props }), face: set.update(0), tick: 0 }
}
const chars = [makeChar('a', -70, 11), makeChar('b', 70, 22)]

// 10 props
const propHandles = Array.from({ length: 10 }, (_, i) => {
  const id = `p${i}`
  world.addProp(id, { x: (i - 5) * 26, y: 120, w: 20, h: 8, stiffnessClass: (['soft', 'medium', 'stiff'] as const)[i % 3] })
  return { id, h: world.bodyHandle(id)!, rect: (() => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('width', '20'); r.setAttribute('height', '8'); r.setAttribute('fill', '#ffd8a8'); r.setAttribute('stroke', '#1a1a1a'); svg.appendChild(r); return r })() }
})

// 1 rope
world.addRope('rope', { ax: -160, ay: -70, bx: 160, by: -70, particles: 16, slack: 0.25 })
world.loadRope('rope', 20, 3)
const ropePoly = document.createElementNS(NS, 'polyline')
ropePoly.setAttribute('fill', 'none'); ropePoly.setAttribute('stroke', '#495057'); ropePoly.setAttribute('stroke-width', '2.5')
svg.appendChild(ropePoly)

// 4 projectile-like free particles
const freeIds = Array.from({ length: 4 }, (_, i) => {
  const id = `free${i}`
  world.addBody(id, [{ x: (i - 2) * 40, y: 60 }], [], 'free', { gravityScale: 1 })
  return id
})
const freeDots = freeIds.map(() => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '4'); c.setAttribute('fill', '#e8590c'); svg.appendChild(c); return c })
for (const id of freeIds) world.applyImpulse(id, 0, -600)

// ── measured loop ────────────────────────────────────────────────────────────────
let simAccum = 0
let writeAccum = 0
let frames = 0
const simSamples: number[] = []
const writeSamples: number[] = []

const loop = createLoop(() => {
  // one sim tick: both characters' pipelines, then ONE shared world.step()
  for (const c of chars) {
    if (c.tick % 240 === 0) c.blender.setSource(c.tick % 480 === 0 ? cheer : stand, { durationMs: 250 })
    c.face = c.set.update(c.tick)
    const { pose } = c.blender.tick()
    c.solved = solveFk(rig, { id: c.id, angles: pose.angles }, { proportions: props, rootTransform: pose.root })
    c.set.feedSolved(c.solved)
    c.secondary.step(c.solved)
    c.tick++
  }
  // keep projectiles alive
  for (const id of freeIds) {
    const p = world.particle(world.bodyHandle(id)!.particleIds[0])
    if (p.y > 160) world.applyImpulse(id, 0, -600)
  }
  world.step()
})

let last = 0
let startMs = 0
function frame(now: number): void {
  if (last === 0) { last = now; startMs = now }
  const t0 = performance.now()
  loop.advance(now - last)
  const t1 = performance.now()
  // render everything
  for (const c of chars) c.renderer.render(c.solved, c.face, c.secondary.overrides())
  for (const p of propHandles) {
    const a = world.particle(p.h.particleIds[0])
    const b = world.particle(p.h.particleIds[1])
    p.rect.setAttribute('x', String((a.x + b.x) / 2 - 10))
    p.rect.setAttribute('y', String((a.y + b.y) / 2 - 4))
    p.rect.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`
    p.rect.style.transformOrigin = `${(a.x + b.x) / 2}px ${(a.y + b.y) / 2}px`
  }
  const rp = world.ropePoints('rope')
  let s = ''
  for (const pt of rp) s += `${pt.x},${pt.y} `
  ropePoly.setAttribute('points', s)
  freeDots.forEach((d, i) => { const p = world.particle(world.bodyHandle(freeIds[i])!.particleIds[0]); d.setAttribute('cx', String(p.x)); d.setAttribute('cy', String(p.y)) })
  const t2 = performance.now()

  simAccum += t1 - t0
  writeAccum += t2 - t1
  simSamples.push(t1 - t0)
  writeSamples.push(t2 - t1)
  frames++
  last = now

  if (now - startMs < 10000) {
    requestAnimationFrame(frame)
  } else {
    const pct = (arr: number[], q: number): number => { const s2 = [...arr].sort((a, b) => a - b); return s2[Math.floor(s2.length * q)] }
    ;(window as unknown as { __perf: unknown }).__perf = {
      frames,
      seconds: (now - startMs) / 1000,
      simMsAvg: simAccum / frames,
      writeMsAvg: writeAccum / frames,
      simMsP95: pct(simSamples, 0.95),
      writeMsP95: pct(writeSamples, 0.95),
      bodies: world.sleepStats().total,
    }
    const el = document.getElementById('out')!
    el.textContent = JSON.stringify((window as unknown as { __perf: unknown }).__perf, null, 2)
  }
}
requestAnimationFrame(frame)
