import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'
import { buildCollisionWorld, createVerletPanelCollider } from '../src/world/collision'
import { hashState } from '../src/hash'
import type { WorldDocV2 } from '@dash/schema'
import { panelEdges } from '../src/world/surfaces'

// One panel: box top edge at y=50 spanning x∈[−60,60] (SVG y-down: things fall from
// y=0 DOWN onto y=50).
function panelWorld(): WorldDocV2 {
  const box = { x: -60, y: 50, w: 120, h: 120 }
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [{ id: 'panel', components: { surface: { box, anchor: { dx: 60, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(box) } } }],
  }
}

const cw = buildCollisionWorld(panelWorld())

test('a prop dropped onto a panel rests ON the surface and SLEEPS (no jitter)', () => {
  const world = createVerletWorld()
  world.setCollisionPass(createVerletPanelCollider(cw))
  // A rigid horizontal bar under gravity, starting above the panel top.
  const h = world.addBody(
    'bar',
    [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ],
    [{ kind: 'distance', a: 0, b: 1, rest: 20, stiffness: 1 }],
    'prop',
    { gravityScale: 1 },
  )

  // settle phase
  for (let t = 0; t < 240; t++) world.step()
  const restYa = world.particle(h.particleIds[0]).y
  const restYb = world.particle(h.particleIds[1]).y
  // rests essentially ON the top edge (y≈50, within the projection skin)
  expect(restYa).toBeGreaterThan(49.5)
  expect(restYa).toBeLessThan(50.5)
  expect(Math.abs(restYa - restYb)).toBeLessThan(0.01) // stays level
  expect(world.isAsleep('bar')).toBe(true) // it settled AND slept

  // stay-settled: no jitter once asleep — position unchanged over 120 more ticks.
  const before = world.particle(h.particleIds[0]).y
  for (let t = 0; t < 120; t++) world.step()
  const after = world.particle(h.particleIds[0]).y
  expect(Math.abs(after - before)).toBeLessThan(1e-9)
  console.log(`[prop rest] rest y=${restYa.toFixed(4)} asleep=${world.isAsleep('bar')} drift=${Math.abs(after - before)}`)
})

test('a rope draped over a panel corner behaves sanely (no tunnelling, finite)', () => {
  const world = createVerletWorld()
  world.setCollisionPass(createVerletPanelCollider(cw))
  // Anchor both ends above the panel; heavy slack so it sags onto the top edge.
  world.addRope('r', { ax: -80, ay: 10, bx: 80, by: 10, particles: 20, slack: 0.5 })
  for (let t = 0; t < 400; t++) world.step()
  const pts = world.ropePoints('r')
  let maxYoverPanel = -Infinity // lowest point of chain resting OVER the panel span
  let maxYall = -Infinity
  for (const p of pts) {
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
    if (p.y > maxYall) maxYall = p.y
    if (p.x > -55 && p.x < 55 && p.y > maxYoverPanel) maxYoverPanel = p.y // clearly within [−60,60]
  }
  // Where the rope lies OVER the panel it rests on the top edge (y=50), never
  // sinking through it. Segments beyond the panel edges hang beside it (sane drape).
  expect(maxYoverPanel).toBeLessThan(51)
  console.log(`[rope drape] over-panel lowest y=${maxYoverPanel.toFixed(3)} (top edge y=50); overall lowest y=${maxYall.toFixed(3)}`)
})

test('DETERMINISM: a mixed scene with collisions is hash-identical over 5000 ticks (same seed)', () => {
  function run(): string {
    const world = createVerletWorld()
    world.setCollisionPass(createVerletPanelCollider(cw))
    world.addBody('bar', [{ x: -10, y: 0 }, { x: 10, y: 0 }], [{ kind: 'distance', a: 0, b: 1, rest: 20, stiffness: 1 }], 'prop', { gravityScale: 1 })
    world.addProp('p0', { x: -30, y: -20, w: 20, h: 8, stiffnessClass: 'medium' })
    world.addRope('r', { ax: -80, ay: 10, bx: 80, by: 10, particles: 14, slack: 0.4 })
    world.applyImpulse('p0', 60, 200) // fling it toward the panel
    for (let t = 0; t < 5000; t++) world.step()
    return hashState(world.getState())
  }
  const a = run()
  const b = run()
  console.log(`[collision determinism] run A=${a} run B=${b}`)
  expect(a).toBe(b)
})
