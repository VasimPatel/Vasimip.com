// replay() self-check — the debuggability contract of the stable surface. We record
// a real Wall-Test-A run, then replay the SAME input against the recorded expectation
// and against deliberately-tampered expectations, asserting both the ok verdict and
// the divergence.kind the caller (an MCP debugging tool) would branch on.
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc } from '@dash/schema'
import { panelEdges } from '@dash/engine'
import { simulate, replay, type SimulateInput } from '../src/index'
import { dashSpec } from './content'

const BOX = { x: 100, y: 100, w: 200, h: 200 }
const GOAL = { x: BOX.x + BOX.w + 120, y: BOX.y + BOX.h / 2 }

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

const WALL_BEHAVIOR: BehaviorDoc = {
  schemaVersion: 2,
  id: 'wall-run',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
  reactions: {
    onBlocked: [
      { verb: 'strikePose', ref: 'squash-land', holdMs: 250 },
      { verb: 'say', text: 'ow!' },
      { verb: 'impulse', target: 'self', vec: [-140, -40] },
    ],
  },
}

/** Wall Test A input (enclosed spawn) — a run with a rich, reaction-bearing trace. */
function input(): SimulateInput {
  return {
    world: cellWorld(),
    characters: [dashSpec({ initialTransform: { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2, rot: 0, facing: 1 }, initialFeetY: BOX.y + BOX.h / 2 })],
    behaviors: [WALL_BEHAVIOR],
    run: { characterId: 'dash', behaviorId: 'wall-run' },
    seed: 7,
  }
}

const BAD_HASH = 'deadbeefdeadbeef'

test('replay: matching hash + traceLength → ok:true, no divergence', () => {
  const rec = simulate(input())
  const r = replay(input(), { hash: rec.hash, traceLength: rec.trace.length })
  expect(r.ok).toBe(true)
  expect(r.divergence).toBeUndefined()
  expect(r.hash).toBe(rec.hash)
  expect(r.outcome).toBe('ended')
})

test('replay: wrong hash → ok:false with divergence.kind "hash" (both values reported)', () => {
  const rec = simulate(input())
  const r = replay(input(), { hash: BAD_HASH })
  expect(r.ok).toBe(false)
  expect(r.divergence?.kind).toBe('hash')
  expect(r.divergence?.expected).toBe(BAD_HASH)
  expect(r.divergence?.actual).toBe(rec.hash)
})

test('replay: matching recorded trace ([{tick,type}]) → ok:true', () => {
  const rec = simulate(input())
  const trace = rec.trace.map((e) => ({ tick: e.tick, type: e.type }))
  const r = replay(input(), { hash: rec.hash, trace })
  expect(r.ok).toBe(true)
  expect(r.divergence).toBeUndefined()
})

test('replay: tampered recorded trace → divergence.kind "trace" at a numeric index', () => {
  const rec = simulate(input())
  const trace = rec.trace.map((e) => ({ tick: e.tick, type: e.type }))
  // Corrupt one event's type partway through so the FIRST divergence is a `trace` mismatch.
  const tamperAt = Math.floor(trace.length / 2)
  trace[tamperAt] = { tick: trace[tamperAt].tick, type: 'intent:bogus-tampered' }
  const r = replay(input(), { hash: rec.hash, trace })
  expect(r.ok).toBe(false)
  expect(r.divergence?.kind).toBe('trace')
  expect(typeof r.divergence?.index).toBe('number')
  expect(r.divergence?.index).toBe(tamperAt)
})
