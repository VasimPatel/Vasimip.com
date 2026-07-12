// Phase 7a gate — PERF. Two character runtimes running behaviors over the real INTRO
// page world, ticked through one shared sim, must average well under 2 ms/tick.
// Timing uses Bun.nanoseconds() (Date.now / performance.now are lint-banned).
import { test, expect } from 'bun:test'
import type { CharacterDoc } from '@dash/schema'
import { worldFromNotebook, createContext, createVerletWorld, createMutableWorld, createCharacterRuntime } from '../src/index'
import { rig, character, clips, poses, names, notebook, STEP } from './harness'

test('two runtimes on the INTRO page average < 2 ms/tick', () => {
  const intro = worldFromNotebook(notebook.pages)[0].world
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(intro, { character, events: ctx.events, stepMs: STEP })

  // Two characters need distinct ids so their secondary verlet bodies don't collide.
  const spawn = (id: string, x: number, y: number) => {
    const char: CharacterDoc = { ...character, id }
    return createCharacterRuntime({
      rig, character: char, world: mw, verlet, rng: ctx.rng, events: ctx.events, clips, poses, names,
      restPose: poses.stand, initialTransform: { x, y, rot: 0, facing: 1 }, secondaryId: `sec:${id}`,
    })
  }
  const r1 = spawn('c1', 304, 40)
  const r2 = spawn('c2', 604, 80)
  r1.runBehavior({ schemaVersion: 2, id: 'a', steps: [{ verb: 'moveTo', target: 'node:panel:0:0:roofR' }] })
  r2.runBehavior({ schemaVersion: 2, id: 'b', steps: [{ verb: 'moveTo', target: 'node:panel:0:1:roofL' }] })

  const N = 2000
  const t0 = Bun.nanoseconds()
  for (let i = 0; i < N; i++) {
    ctx.clock.advance()
    r1.tick()
    r2.tick()
    verlet.step()
  }
  const msPerTick = (Bun.nanoseconds() - t0) / 1e6 / N
  console.log(`[perf] 2 chars on INTRO: ${msPerTick.toFixed(4)} ms/tick`)
  expect(msPerTick).toBeLessThan(2)
})
