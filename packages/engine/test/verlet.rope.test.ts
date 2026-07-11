import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'

// Rope + load regression (independent-review finding). The load couples to the rope
// via the ONE cross-body constraint in P5; the two bodies form a wake group:
//  R1 a loaded rope sags measurably deeper than an unloaded one (coupling works);
//  R2 the load stays coupled (|load − nearest node| ≈ rest) after settling;
//  R3 sleep desync: after both bodies sleep, a poke on the ROPE wakes the LOAD too
//     (wake-group propagation), and the coupling still holds after the swing.

const ROPE = { ax: -110, ay: -30, bx: 110, by: -30, particles: 16, slack: 0.28 }

function maxSag(world: ReturnType<typeof createVerletWorld>): number {
  let m = -Infinity
  for (const p of world.ropePoints('r')) m = Math.max(m, p.y)
  return m
}

test('R1+R2: loaded rope sags deeper and the load stays coupled', () => {
  const plain = createVerletWorld()
  plain.addRope('r', ROPE)
  for (let t = 0; t < 600; t++) plain.step()
  const sag = maxSag(plain)

  const loaded = createVerletWorld()
  loaded.addRope('r', ROPE)
  loaded.loadRope('r', 20, 8)
  for (let t = 0; t < 600; t++) loaded.step()
  const sagLoaded = maxSag(loaded)

  const load = loaded.bodyHandle('r__load')!
  const lp = loaded.particle(load.particleIds[0])
  // nearest chain node distance — the coupling rest is 6
  let nearest = Infinity
  for (const p of loaded.ropePoints('r')) nearest = Math.min(nearest, Math.hypot(p.x - lp.x, p.y - lp.y))
  console.log(`[rope] sag=${sag.toFixed(2)} sagLoaded=${sagLoaded.toFixed(2)} loadCoupling=${nearest.toFixed(2)} (rest 6)`)
  expect(sagLoaded).toBeGreaterThan(sag + 3) // measurably deeper
  expect(Math.abs(nearest - 6)).toBeLessThan(1.5) // still coupled
  expect(Number.isFinite(lp.x) && Number.isFinite(lp.y)).toBe(true)
})

test('R3: poke the rope after both sleep → load wakes with it (wake group), coupling holds', () => {
  const world = createVerletWorld()
  world.addRope('r', ROPE)
  world.loadRope('r', 0, 3)
  // settle until BOTH bodies sleep
  let ticks = 0
  while ((!world.isAsleep('r') || !world.isAsleep('r__load')) && ticks < 4000) {
    world.step()
    ticks++
  }
  expect(world.isAsleep('r')).toBe(true)
  expect(world.isAsleep('r__load')).toBe(true)

  // poke the ROPE only
  world.applyImpulse('r', 150, -100)
  world.step()
  expect(world.isAsleep('r')).toBe(false)
  expect(world.isAsleep('r__load')).toBe(false) // wake-group propagation

  // let the swing play out; the load must remain coupled the whole time
  let worst = 0
  for (let t = 0; t < 600; t++) {
    world.step()
    const lp = world.particle(world.bodyHandle('r__load')!.particleIds[0])
    let nearest = Infinity
    for (const p of world.ropePoints('r')) nearest = Math.min(nearest, Math.hypot(p.x - lp.x, p.y - lp.y))
    worst = Math.max(worst, Math.abs(nearest - 6))
  }
  console.log(`[rope wake] slept after ${ticks} ticks; worst coupling error during swing = ${worst.toFixed(3)}px`)
  expect(worst).toBeLessThan(2)
})
