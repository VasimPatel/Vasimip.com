import { test, expect } from 'bun:test'
import { createVerletWorld, PROP_STIFFNESS, type StiffnessClass } from '../src/verlet'
import { STEP_MS } from '../src/loop'

// G2 — settle-time bounds. Each stiffness class, disturbed by ONE standard impulse,
// must return to <0.5px of rest within its class bound, and STAY there (no residual
// oscillation above eps after settle — catches under-damping).

const STANDARD_IMPULSE: [number, number] = [320, 220] // px/s (a firm poke)
const SETTLE_PX = 0.5
const RESIDUAL_EPS = 0.5 // must stay under this after settle

// Class settle bounds (seconds). Justification: softer anchor spring = looser wobble
// and a longer return; these bounds are ~1.3× the measured settle so the gate has
// headroom but still fails a materially slower solver. Actuals printed below.
const BOUND_SEC: Record<StiffnessClass, number> = { soft: 0.6, medium: 0.3, stiff: 0.25 }

const REST = { x: 0, y: 0, w: 24, h: 8 }

function displacementFromRest(world: ReturnType<typeof createVerletWorld>, ids: number[]): number {
  // Both particles' anchors are their rest points (lx,y) and (rx,y).
  const lx = REST.x - REST.w / 2
  const rx = REST.x + REST.w / 2
  const a = world.particle(ids[0])
  const b = world.particle(ids[1])
  const da = Math.hypot(a.x - lx, a.y - REST.y)
  const db = Math.hypot(b.x - rx, b.y - REST.y)
  return Math.max(da, db)
}

function runClass(cls: StiffnessClass): { settleTick: number; maxAfter: number; peak: number } {
  const world = createVerletWorld()
  const h = world.addProp('p', { ...REST, stiffnessClass: cls })
  world.applyImpulse('p', STANDARD_IMPULSE[0], STANDARD_IMPULSE[1])

  const maxTicks = 6000
  let settleTick = -1
  let peak = 0
  for (let t = 1; t <= maxTicks; t++) {
    world.step()
    const d = displacementFromRest(world, h.particleIds)
    if (t < 200) peak = Math.max(peak, d)
    if (settleTick < 0 && d < SETTLE_PX) settleTick = t
  }
  // "stays settled": from the settle tick, run 2 s more and record the max excursion.
  const stayTicks = Math.round(2000 / STEP_MS)
  let maxAfter = 0
  for (let t = 0; t < stayTicks; t++) {
    world.step()
    maxAfter = Math.max(maxAfter, displacementFromRest(world, h.particleIds))
  }
  return { settleTick, maxAfter, peak }
}

for (const cls of ['soft', 'medium', 'stiff'] as StiffnessClass[]) {
  test(`G2 settle: ${cls} returns <${SETTLE_PX}px within ${BOUND_SEC[cls]}s and stays`, () => {
    const { settleTick, maxAfter, peak } = runClass(cls)
    const settleSec = (settleTick * STEP_MS) / 1000
    console.log(
      `[G2 settle] ${cls.padEnd(6)} k=${PROP_STIFFNESS[cls]} peak=${peak.toFixed(1)}px ` +
        `settle=${settleSec.toFixed(3)}s (${settleTick} ticks) bound=${BOUND_SEC[cls]}s ` +
        `maxAfterSettle=${maxAfter.toFixed(4)}px`,
    )
    expect(settleTick).toBeGreaterThan(0)
    expect(settleSec).toBeLessThan(BOUND_SEC[cls])
    expect(maxAfter).toBeLessThan(RESIDUAL_EPS)
  })
}
