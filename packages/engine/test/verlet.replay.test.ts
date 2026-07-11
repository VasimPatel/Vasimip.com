import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'
import { createSecondary } from '../src/secondary'
import { solveFk } from '../src/fk'
import { hashState } from '../src/hash'
import { rig, stand, props } from './fixtures'

// G1 — drag replay identity. A scripted drag of the character's forearm chain (pin
// follows a path ~2s, release, settle) run twice from scratch → identical hashState +
// identical trace. Also: snapshot mid-drag → restore into a fresh scene → continue →
// identical final hash to the straight run.

const DRAG_END = 240 // 2 s @120Hz
const TOTAL = 360 // + 1 s settle after release

// Static post-additive skeleton (no controllers needed — this gate is the verlet/drag
// path, and a static FK makes the anchor targets constant so the drag is the variable).
const SOLVED = solveFk(rig, { id: 'stand', angles: stand.angles }, { proportions: props, rootTransform: stand.root })
const BASE = SOLVED.bones.find((b) => b.id === 'foreArmR')!

function pathX(t: number): number {
  return BASE.ex + 34 * Math.cos(t * 0.11)
}
function pathY(t: number): number {
  return BASE.ey + 28 * Math.sin(t * 0.11) - 0.15 * t
}

interface Scene {
  world: ReturnType<typeof createVerletWorld>
  secondary: ReturnType<typeof createSecondary>
  endR: number
}

function build(): Scene {
  const world = createVerletWorld()
  const secondary = createSecondary(rig, world, { proportions: props, id: 'secondary' })
  secondary.step(SOLVED) // build the body + set initial targets (no world.step → no sim yet)
  const endR = secondary.endParticleId('foreArmR')!
  return { world, secondary, endR }
}

function tickOnce(s: Scene, t: number): void {
  s.secondary.step(SOLVED) // kinematic anchor follow (static here)
  if (t <= DRAG_END) s.world.setPin(s.endR, pathX(t), pathY(t))
  else if (t === DRAG_END + 1) s.world.unpin(s.endR)
  s.world.step()
}

function runDrag(snapshotAt?: number): { finalHash: string; traceHash: string } {
  let s = build()
  const trace: number[] = []
  for (let t = 1; t <= TOTAL; t++) {
    if (snapshotAt !== undefined && t === snapshotAt + 1) {
      const snap = s.world.getState()
      const fresh = build() // fresh structure, then restore mid-drag state into it
      fresh.world.setState(snap)
      s = fresh
    }
    tickOnce(s, t)
    const p = s.world.particle(s.endR)
    trace.push(p.x, p.y)
  }
  return { finalHash: hashState(s.world.getState()), traceHash: hashState(trace) }
}

test('G1 drag replay: run twice from scratch → identical hash + trace', () => {
  const a = runDrag()
  const b = runDrag()
  console.log(`[G1 replay] A hash=${a.finalHash} trace=${a.traceHash}`)
  console.log(`[G1 replay] B hash=${b.finalHash} trace=${b.traceHash}`)
  expect(b.finalHash).toBe(a.finalHash)
  expect(b.traceHash).toBe(a.traceHash)
})

test('G1 snapshot/restore mid-drag → continue → identical to straight run', () => {
  const straight = runDrag()
  const resumed = runDrag(150) // snapshot at tick 150 (mid-drag), restore, continue
  console.log(`[G1 restore] straight=${straight.finalHash} resumed=${resumed.finalHash}`)
  expect(resumed.finalHash).toBe(straight.finalHash)
  expect(resumed.traceHash).toBe(straight.traceHash)
})
