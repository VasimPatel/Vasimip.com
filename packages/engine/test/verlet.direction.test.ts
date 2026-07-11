import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'

// Impulse DIRECTION regression (orchestrator review finding). Position verlet derives
// velocity as (pos − prev): the original applyImpulse ADDED to prev, which SUBTRACTED
// velocity — every impulse was silently inverted, and all other gates are direction-
// agnostic (magnitudes, settle times, hashes), so only an explicit sign assertion
// catches it. Convention pinned here as executable fact, not a comment:
//   +vx moves the body RIGHT (+x);  +vy moves it DOWN (+y — SVG y-down).

function freeParticleAfter(vx: number, vy: number, ticks: number): { x: number; y: number } {
  const world = createVerletWorld({ gravity: 0 }) // zero gravity isolates the impulse
  const h = world.addBody('b', [{ x: 0, y: 0 }], [], 'free')
  world.applyImpulse('b', vx, vy)
  for (let t = 0; t < ticks; t++) world.step()
  return world.particle(h.particleIds[0])
}

test('impulse +x moves the body in +x (right), and ONLY +x', () => {
  const p = freeParticleAfter(100, 0, 12)
  console.log(`[direction] impulse (+100, 0) after 12 ticks → (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`)
  expect(p.x).toBeGreaterThan(1) // strictly rightward, well clear of zero
  expect(p.y).toBe(0)
})

test('impulse +y moves the body in +y (DOWN — SVG y-down convention)', () => {
  const p = freeParticleAfter(0, 100, 12)
  console.log(`[direction] impulse (0, +100) after 12 ticks → (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`)
  expect(p.y).toBeGreaterThan(1) // +y is down the screen
  expect(p.x).toBe(0)
})

test('impulse −y moves the body UP (how a "poke up" is authored)', () => {
  const p = freeParticleAfter(0, -100, 12)
  expect(p.y).toBeLessThan(-1)
})

test('first-tick magnitude ≈ v·dt·damping (the impulse is px/s, not px/tick)', () => {
  const world = createVerletWorld({ gravity: 0 })
  const h = world.addBody('b', [{ x: 0, y: 0 }], [], 'free')
  world.applyImpulse('b', 120, 0)
  world.step()
  const p = world.particle(h.particleIds[0])
  // one tick at 120 Hz: 120 px/s · (1/120 s) · 0.965 damping = 0.965 px
  expect(Math.abs(p.x - 0.965)).toBeLessThan(1e-9)
})
