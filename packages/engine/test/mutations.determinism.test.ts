import { test, expect } from 'bun:test'
import {
  createMutableWorld,
  createRuleTable,
  createProjectileSim,
  createVerletWorld,
  hashState,
  panelEdges,
  STEP_MS,
} from '../src/index'
import type { WorldDocV2 } from '@dash/schema'

function world(): WorldDocV2 {
  const W = { x: 200, y: 0, w: 20, h: 400 } // tall damageable wall
  const P = { x: 0, y: 0, w: 120, h: 200 } // a cuttable panel
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      { id: 'W', components: { surface: { box: W, anchor: { dx: 10, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(W) }, damageable: {} } },
      { id: 'P', components: { surface: { box: P, anchor: { dx: 60, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(P) }, damageable: {} } },
    ],
  }
}

// ── heal timing is tick-exact ─────────────────────────────────────────────────────
test('heal fires at EXACTLY ceil(healAfterMs / STEP_MS) ticks after the cut', () => {
  const mw = createMutableWorld(world())
  const healAfterMs = 500
  const N = Math.ceil(healAfterMs / STEP_MS)
  mw.cut('P', { edge: 'roof', start: 40, width: 20 }, { healAfterMs })
  for (let t = 0; t < N - 1; t++) mw.stepMutations()
  expect(mw.holesInPanel('P')).toHaveLength(1) // still open one tick before
  mw.stepMutations() // the Nth tick
  expect(mw.holesInPanel('P')).toHaveLength(0) // healed exactly now
  const healed = mw.trace().find((e) => e.type === 'healed')
  expect(healed!.tick).toBe(N)
})

// ── snapshot / restore mid-heal-countdown continues correctly ─────────────────────
test('snapshot/restore mid-countdown resumes the heal at the same tick', () => {
  const healAfterMs = 500
  const N = Math.ceil(healAfterMs / STEP_MS)
  const k = Math.floor(N / 2)

  const a = createMutableWorld(world())
  a.cut('P', { edge: 'roof', start: 40, width: 20 }, { healAfterMs })
  for (let t = 0; t < k; t++) a.stepMutations()
  const snap = JSON.parse(JSON.stringify(a.getState())) // plain-JSON round-trip

  // Restore into a fresh world and finish the countdown.
  const b = createMutableWorld(world())
  b.setState(snap)
  for (let t = 0; t < N - k - 1; t++) b.stepMutations()
  expect(b.holesInPanel('P')).toHaveLength(1) // one tick short
  b.stepMutations()
  expect(b.holesInPanel('P')).toHaveLength(0) // heals right on schedule
})

// ── a 5,000-tick mixed cut/heal/projectile scene hashes identically, same seed ─────
function runScene(): string {
  const mw = createMutableWorld(world())
  const table = createRuleTable()
  const vw = createVerletWorld()
  vw.addProp('bar', { x: 60, y: 260, w: 40, h: 10, stiffnessClass: 'medium' })
  const sim = createProjectileSim(mw, table, { cutWidth: 16 })

  for (let t = 0; t < 5000; t++) {
    // fire a laser at the damageable wall every 400 ticks (varying y)
    if (t % 400 === 0) sim.fire({ x: 0, y: 40 + (t / 400) * 30, vx: 6000, vy: 0 })
    // author-style cuts on P: a healing one and a session one, on a schedule
    if (t % 700 === 100) mw.cut('P', { edge: 'roof', start: 20, width: 20 }, { healAfterMs: 300 })
    if (t === 250) mw.cut('P', { edge: 'wallL', start: 40, width: 30 }, { persistScope: 'session' })
    // poke the prop occasionally (verlet inlet)
    if (t % 900 === 50) vw.applyImpulse('bar', 0, 200)
    vw.step()
    mw.stepMutations()
    sim.step()
  }
  return hashState({ mw: mw.getState(), sim: sim.getState(), vw: vw.getState() })
}

test('5000-tick mixed scene: identical state hash across two runs (determinism)', () => {
  const h1 = runScene()
  const h2 = runScene()
  expect(h1).toBe(h2)
  console.log(`[6b determinism] 5000-tick mixed cut/heal/projectile hash=${h1}`)
})
