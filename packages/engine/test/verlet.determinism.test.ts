import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'
import { createSecondary } from '../src/secondary'
import { createBlender } from '../src/blender'
import { createControllerSet } from '../src/controllers'
import { createRng } from '../src/rng'
import { solveFk } from '../src/fk'
import { hashState } from '../src/hash'
import { rig, character, stand, cheer, props } from './fixtures'

// G5 — determinism. A 5,000-tick MIXED scene (2 characters w/ secondary, props, a
// loaded rope, a scripted drag, and impulses scheduled by tick) hashes identically
// when run twice from the same seeds. The hash covers EVERY stateful part: the verlet
// world, both blenders, both blink schedules, and both RNG states.

const TOTAL = 5000
const DRAG_FROM = 500
const DRAG_TO = 1000

// tick → [propId, vx, vy]
const SCHEDULE: Array<[number, string, number, number]> = [
  [200, 'prop0', 300, -120],
  [640, 'prop3', -250, 180],
  [1500, 'prop1', 180, 260],
  [2600, 'prop4', -320, -90],
  [3300, 'prop2', 140, 200],
  [4200, 'prop5', -200, 220],
]

function makeChar(world: ReturnType<typeof createVerletWorld>, id: string, seed: number) {
  const blender = createBlender(rig, { initialPose: stand })
  const rng = createRng(seed)
  const set = createControllerSet(blender, rig, character, { rng })
  const secondary = createSecondary(rig, world, { proportions: props, id: `secondary:${id}` })
  let tick = 0
  let solvedCache = solveFk(rig, { id, angles: stand.angles }, { proportions: props, rootTransform: stand.root })
  // Alternate the base pose target every ~1.7s so the blend layer is exercised too.
  function updateTargets(): void {
    if (tick % 200 === 0) blender.setSource(tick % 400 === 0 ? cheer : stand, { durationMs: 350 })
  }
  function step(): void {
    updateTargets()
    const face = set.update(tick)
    const { pose } = blender.tick()
    solvedCache = solveFk(rig, { id, angles: pose.angles }, { proportions: props, rootTransform: pose.root })
    set.feedSolved(solvedCache)
    secondary.step(solvedCache)
    void face
    tick++
  }
  return { blender, set, rng, secondary, step, solved: () => solvedCache }
}

function run(): string {
  const world = createVerletWorld()
  const c0 = makeChar(world, 'dash', 101)
  const c1 = makeChar(world, 'pip', 202)
  for (let i = 0; i < 6; i++) {
    world.addProp(`prop${i}`, { x: (i - 3) * 34, y: 90, w: 20, h: 8, stiffnessClass: (['soft', 'medium', 'stiff'] as const)[i % 3] })
  }
  world.addRope('rope', { ax: -160, ay: -50, bx: 160, by: -50, particles: 12, slack: 0.2 })
  world.loadRope('rope', 20, 3)

  const sched = new Map<number, Array<[string, number, number]>>()
  for (const [t, id, vx, vy] of SCHEDULE) {
    const list = sched.get(t) ?? []
    list.push([id, vx, vy])
    sched.set(t, list)
  }

  const dragEnd = c0.secondary // built after first step
  let endR = -1
  for (let t = 1; t <= TOTAL; t++) {
    c0.step()
    c1.step()
    if (endR < 0) endR = dragEnd.endParticleId('foreArmR') ?? -1
    // scripted drag of char0's forearm end
    if (t >= DRAG_FROM && t <= DRAG_TO && endR >= 0) {
      const b = c0.solved().bones.find((bn) => bn.id === 'foreArmR')!
      world.setPin(endR, b.ex + 30 * Math.cos(t * 0.09), b.ey + 24 * Math.sin(t * 0.09))
    } else if (t === DRAG_TO + 1 && endR >= 0) {
      world.unpin(endR)
    }
    const hits = sched.get(t)
    if (hits) for (const [id, vx, vy] of hits) world.applyImpulse(id, vx, vy)
    world.step()
  }

  return hashState({
    world: world.getState(),
    b0: c0.blender.getState(),
    b1: c1.blender.getState(),
    blink0: c0.set.getBlinkState(),
    blink1: c1.set.getBlinkState(),
    rng0: c0.rng.getState(),
    rng1: c1.rng.getState(),
  })
}

test('G5 determinism: 5000-tick mixed scene, same seeds → identical hash (run twice)', () => {
  const a = run()
  const b = run()
  console.log(`[G5 determinism] run A = ${a}`)
  console.log(`[G5 determinism] run B = ${b}`)
  expect(b).toBe(a)
})
