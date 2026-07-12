// P8 review hardening — regression gates for the blockers/should-fixes:
//   · complexity caps reject over-cap payloads FAST (before cloning/construction)
//   · shouldAbort covers SETUP (a tripped guard aborts with ticks=0, outcome 'aborted')
//   · every nested doc is schema-validated before construction
//   · '__proto__' as a behavior id is inert (null-prototype registry)
//   · the caller mutating the input mid-run (via shouldAbort) cannot change the result
//   · validate() dispatch requires EXACTLY ONE discriminant; the world validator
//     closes its top-level keys
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc } from '@dash/schema'
import { panelEdges } from '@dash/engine'
import {
  simulate,
  validate,
  MAX_ENTITIES,
  MAX_CHARACTERS,
  MAX_BEHAVIORS,
  MAX_BEHAVIOR_STEPS,
  type SimulateInput,
} from '../src/index'
import { dashSpec } from './content'

// ── shared fixtures (the Wall-Test cell, same as the acceptance suite) ──────────────
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

const RUN_BEHAVIOR: BehaviorDoc = {
  schemaVersion: 2,
  id: 'run-out',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
}

function baseInput(): SimulateInput {
  return {
    world: cellWorld(),
    characters: [
      dashSpec({
        initialTransform: { x: BOX.x + BOX.w + 40, y: BOX.y + BOX.h / 2, rot: 0, facing: 1 },
        initialFeetY: BOX.y + BOX.h / 2,
      }),
    ],
    behaviors: [RUN_BEHAVIOR],
    run: { characterId: 'dash', behaviorId: 'run-out' },
    seed: 7,
  }
}

// ── complexity caps ──────────────────────────────────────────────────────────────────
test(`caps: a world with ${MAX_ENTITIES + 1} entities rejects fast with a clear error`, () => {
  const world = cellWorld()
  for (let i = 0; i < MAX_ENTITIES; i++) {
    world.entities.push({ id: `filler:${i}`, components: { transform: { x: i, y: 0 } } })
  }
  expect(world.entities.length).toBeGreaterThan(MAX_ENTITIES)
  expect(() => simulate({ world })).toThrow(/complexity cap exceeded — world has \d+ entities/)
})

test('caps: too many character specs / behavior docs / behavior steps all reject', () => {
  const spec = dashSpec()
  expect(() =>
    simulate({ world: cellWorld(), characters: Array.from({ length: MAX_CHARACTERS + 1 }, () => spec) }),
  ).toThrow(/complexity cap exceeded — \d+ character specs/)

  const manyBehaviors = Array.from({ length: MAX_BEHAVIORS + 1 }, (_, i) => ({ ...RUN_BEHAVIOR, id: `b${i}` }))
  expect(() => simulate({ world: cellWorld(), behaviors: manyBehaviors })).toThrow(
    /complexity cap exceeded — \d+ behavior docs/,
  )

  const fatBehavior: BehaviorDoc = {
    schemaVersion: 2,
    id: 'fat',
    steps: Array.from({ length: MAX_BEHAVIOR_STEPS + 1 }, () => ({ verb: 'wait' as const, ms: 1 })),
  }
  expect(() => simulate({ world: cellWorld(), behaviors: [fatBehavior] })).toThrow(
    /complexity cap exceeded — behaviors\[0\] has \d+ steps/,
  )
})

// ── shouldAbort during setup ─────────────────────────────────────────────────────────
test("shouldAbort covers setup: a guard that trips immediately → outcome 'aborted', ticks 0", () => {
  const res = simulate(baseInput(), { shouldAbort: () => true })
  expect(res.outcome).toBe('aborted')
  expect(res.ticks).toBe(0)
})

// ── nested doc validation ────────────────────────────────────────────────────────────
test('nested docs are validated: a corrupt rig / behavior rejects with a located error', () => {
  const badRig = baseInput()
  ;(badRig.characters![0].rig as unknown as { joints: unknown }).joints = [
    { id: 'a', parentId: 'ghost', length: 10 }, // unknown parent, no root
  ]
  expect(() => simulate(badRig)).toThrow(/invalid characters\[0\]\.rig/)

  const badBehavior = baseInput()
  badBehavior.behaviors = [{ schemaVersion: 2, id: 'bad', steps: [{ verb: 'noSuchVerb' }] } as unknown as BehaviorDoc]
  expect(() => simulate(badBehavior)).toThrow(/invalid behaviors\[0\]/)
})

// ── '__proto__' as a behavior id is inert ────────────────────────────────────────────
test("registry safety: behavior id '__proto__' resolves as an ordinary key, no pollution", () => {
  const input = baseInput()
  // JSON.parse (the server's path) creates '__proto__' as an OWN property — replicate.
  const proto = JSON.parse(`{"schemaVersion":2,"id":"__proto__","steps":[{"verb":"moveTo","target":"entity:goal"}]}`) as BehaviorDoc
  input.behaviors = [proto]
  input.run = { characterId: 'dash', behaviorId: '__proto__' }

  const res = simulate(input)
  expect(res.outcome).toBe('complete') // found + ran like any other id
  expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'steps')).toBe(false)
})

// ── input-mutation immunity (whole-input clone) ──────────────────────────────────────
test('mutating the input object mid-run via shouldAbort cannot change the result', () => {
  const clean = simulate(baseInput())

  const input = baseInput()
  const res = simulate(input, {
    shouldAbort: () => {
      // Hostile caller: mutate everything reachable, every check.
      input.seed = 999
      input.world.entities.length = 0
      input.behaviors![0].steps.length = 0
      input.characters![0].initialTransform!.x = -99999
      return false
    },
  })
  expect(res.hash).toBe(clean.hash)
  expect(res.ticks).toBe(clean.ticks)
  expect(res.trace.length).toBe(clean.trace.length)
})

// ── validate() dispatch: exactly one discriminant + closed world top level ──────────
test('validate: a doc with entities[] AND steps[] is ambiguous — an error, never a world', () => {
  const r = validate({ schemaVersion: 2, seed: 1, entities: [], steps: [] })
  expect(r.ok).toBe(false)
  expect(r.kind).toBe('unknown')
  expect(r.errors?.[0]).toMatch(/ambiguous shape .*world, behavior/)
})

test('validate: the world validator closes its top level — stray keys are rejected', () => {
  const r = validate({ schemaVersion: 2, seed: 1, entities: [], sneaky: true })
  expect(r.ok).toBe(false)
  expect(r.kind).toBe('world')
  expect(r.errors?.some((e) => e.includes('doc.sneaky: unknown field'))).toBe(true)
})
