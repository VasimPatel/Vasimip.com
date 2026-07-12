// ═══════════════════════════════════════════════════════════════════════════════
// THE WALL TEST — through the PUBLIC headless surface (ENGINE_V2 §1 north star).
//
// The engine-level Wall Test (packages/engine/test/acceptance.walltest.test.ts)
// drives the runtime stack by hand. THIS file reproduces the identical A/B scenario
// through simulate() — the JSON-in/JSON-out function a future MCP tool wraps 1:1 —
// to prove the north-star gate holds at the stable surface, not just internally.
//
// ONE behavior doc ("run to the goal panel" with an authored onBlocked reaction —
// bonk + "ow!" + a backward impulse). TWO worlds differing ONLY in the spawn point
// against the SAME live geometry:
//   World A — enclosed by the cell's right wall → run, intent:blocked, the authored
//             reaction, behavior:ended, outcome 'ended'.
//   World B — the SAME doc spawned outside the wall → clean traversal, intent:arrived,
//             behavior:complete, outcome 'complete', and NO reaction events at all.
// Plus determinism: World A run twice → identical hash AND trace length.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc } from '@dash/schema'
import { panelEdges, type TraceEvent } from '@dash/engine'
import { simulate, type SimulateInput } from '../src/index'
import { dashSpec } from './content'

const BOX = { x: 100, y: 100, w: 200, h: 200 }
const GOAL = { x: BOX.x + BOX.w + 120, y: BOX.y + BOX.h / 2 } // outside the right wall

function cellWorld(): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'cell',
        components: {
          transform: { x: BOX.x, y: BOX.y },
          surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } },
          collidable: { shape: 'segments', segments: panelEdges(BOX) },
        },
      },
      { id: 'goal', components: { transform: { x: GOAL.x, y: GOAL.y } } },
    ],
  }
}

// ONE behavior, byte-identical between the two worlds — the whole point of the test.
const WALL_BEHAVIOR: BehaviorDoc = {
  schemaVersion: 2,
  id: 'wall-run',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
  reactions: {
    onBlocked: [
      { verb: 'strikePose', ref: 'squash-land', holdMs: 250 }, // the bonk (impact pose)
      { verb: 'say', text: 'ow!' },
      { verb: 'impulse', target: 'self', vec: [-140, -40] }, // backward = away from the wall
    ],
  },
}

/** Build the simulate() input, spawning the character at `spawn`; feet-snapped to
 *  the box centre line, seed 7 (deterministic), driving WALL_BEHAVIOR on Dash. */
function wallInput(spawn: { x: number; y: number }): SimulateInput {
  return {
    world: cellWorld(),
    characters: [dashSpec({ initialTransform: { x: spawn.x, y: spawn.y, rot: 0, facing: 1 }, initialFeetY: BOX.y + BOX.h / 2 })],
    behaviors: [WALL_BEHAVIOR],
    run: { characterId: 'dash', behaviorId: 'wall-run' },
    seed: 7,
  }
}

const typesOf = (trace: TraceEvent[]) => trace.map((e) => e.type)
const has = (trace: TraceEvent[], type: string) => trace.some((e) => e.type === type)

test('WALL TEST A — enclosed: run → blocked → authored reaction → behavior ENDS (outcome "ended")', () => {
  const res = simulate(wallInput({ x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 }))

  // Print the canonical World-A hash for the acceptance report.
  console.log(`[WALL TEST A] outcome=${res.outcome} ticks=${res.ticks} hash=${res.hash}`)

  expect(res.outcome).toBe('ended')
  // The run hit the wall, the AUTHORED onBlocked reaction fired (bonk + "ow!" + impulse),
  // and the behavior ended gracefully with a reason.
  expect(has(res.trace, 'intent:blocked')).toBe(true)
  expect(res.trace.some((e) => e.type === 'reaction:run' && (e.payload as { trigger?: string }).trigger === 'onBlocked')).toBe(true)
  const say = res.trace.filter((e) => e.type === 'intent:say')
  expect(say).toHaveLength(1)
  expect((say[0].payload as { text: string }).text).toBe('ow!')
  const imp = res.trace.filter((e) => e.type === 'intent:impulse')
  expect(imp).toHaveLength(1)
  expect((imp[0].payload as { vec: [number, number] }).vec[0]).toBeLessThan(0) // backward (away from wall)
  expect(res.trace.some((e) => e.type === 'behavior:ended' && (e.payload as { reason?: string }).reason === 'blocked')).toBe(true)
  // NOT an arrival — the wall stopped it.
  expect(has(res.trace, 'intent:arrived')).toBe(false)
})

test('WALL TEST B — outside: the SAME doc traverses cleanly, arrives, NO reaction (outcome "complete")', () => {
  const res = simulate(wallInput({ x: BOX.x + BOX.w + 40, y: BOX.y + BOX.h / 2 }))

  console.log(`[WALL TEST B] outcome=${res.outcome} ticks=${res.ticks} hash=${res.hash}`)

  expect(res.outcome).toBe('complete')
  expect(res.trace.filter((e) => e.type === 'intent:arrived')).toHaveLength(1)
  // NO reaction fired: no block, no bonk, no "ow!", no impulse.
  expect(has(res.trace, 'intent:blocked')).toBe(false)
  expect(has(res.trace, 'reaction:run')).toBe(false)
  expect(has(res.trace, 'intent:say')).toBe(false)
  expect(has(res.trace, 'intent:impulse')).toBe(false)
})

test('WALL TEST — determinism: World A run twice → identical hash and trace length', () => {
  const a = simulate(wallInput({ x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 }))
  const b = simulate(wallInput({ x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 }))
  expect(a.hash).toBe(b.hash)
  expect(a.trace.length).toBe(b.trace.length)
  expect(typesOf(a.trace)).toEqual(typesOf(b.trace))
  expect(a.ticks).toBe(b.ticks)
})
