// Phase 7b — MIGRATION DRY-RUN. Three legacy built-ins re-authored as REAL behavior
// content (content/engine/behaviors/*.json) and verified BY TRACE against their
// semantics:
//   hop       = launch + land + arrive (a simple jumpTo).
//   vault     = launch, a flourish cue at launch (strikePose), land, arrive (jumpTo + cues).
//   tightrope = a slow traverse with say/pose beats + an onArrive cue (moveTo + cues).
// APPROXIMATED UNTIL P9 (documented): the rope-walk physics + true slow speed + a
// mid-traverse balance wobble are P9 content — a moveTo with flavor cues stands in.
import { readFileSync } from 'node:fs'
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc } from '@dash/schema'
import { tryValidateBehavior } from '@dash/schema'
import { newRuntime, snapFeet, step, driveUntilDone, eventsOf, type Runtime } from './harness'

function loadBuiltin(name: string): BehaviorDoc {
  const raw = JSON.parse(readFileSync(new URL(`../../../content/engine/behaviors/${name}.json`, import.meta.url), 'utf8'))
  const v = tryValidateBehavior(raw)
  if (!v.ok) throw new Error(`${name}.json invalid: ${v.errors.join('; ')}`)
  return v.doc
}
const HOP = loadBuiltin('hop')
const VAULT = loadBuiltin('vault')
const TIGHTROPE = loadBuiltin('tightrope')

const FLOOR_Y = 300
function floorWorld(goalX: number): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'F',
        components: {
          transform: { x: 0, y: FLOOR_Y },
          surface: { box: { x: 0, y: FLOOR_Y, w: 800, h: 20 }, anchor: { dx: 400, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 800, y2: FLOOR_Y }] },
        },
      },
      { id: 'goal', components: { transform: { x: goalX, y: FLOOR_Y } } },
    ],
  }
}
function spawn(goalX: number, x = 200): Runtime {
  const r = newRuntime(floorWorld(goalX), { x, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  return r
}

test('hop — launch + land + arrive', () => {
  const r = spawn(340) // ~140px ahead, within jump caps (dist 180, height 0)
  r.rt.runBehavior(HOP)
  driveUntilDone(r, 3000)
  const launch = eventsOf(r, 'jump:launch')[0]?.tick
  const land = eventsOf(r, 'jump:land')[0]?.tick
  const arrive = eventsOf(r, 'intent:arrived')[0]?.tick
  expect(launch).toBeDefined()
  expect(land).toBeGreaterThan(launch!)
  expect(arrive).toBeGreaterThanOrEqual(land!)
  expect(r.rt.behavior.status).toBe('complete')
})

test('vault — launch, a flourish cue AT the launch, land, arrive', () => {
  const r = spawn(340)
  r.rt.runBehavior(VAULT)
  driveUntilDone(r, 3000)
  const launchTick = eventsOf(r, 'jump:launch')[0]?.tick
  const landTick = eventsOf(r, 'jump:land')[0]?.tick
  // the onLaunch flourish: a strikePose cue + a whoosh sfx cue, both ON the launch tick.
  const flourish = eventsOf(r, 'cue:strikePose')
  expect(flourish).toHaveLength(1)
  expect(flourish[0].tick).toBe(launchTick!)
  expect((flourish[0].payload as { ref: string }).ref).toBe('cheer')
  const whoosh = eventsOf(r, 'intent:sfx').find((e) => (e.payload as { kind: string }).kind === 'whoosh')
  expect(whoosh?.tick).toBe(launchTick!)
  const thud = eventsOf(r, 'intent:sfx').find((e) => (e.payload as { kind: string }).kind === 'thud')
  expect(thud?.tick).toBe(landTick!)
  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(r.rt.behavior.status).toBe('complete')
})

test('tightrope — a balance pose + "steady…", a traverse, then an onArrive cue', () => {
  const r = spawn(420)
  r.rt.runBehavior(TIGHTROPE)
  driveUntilDone(r, 4000)
  // the pre-traverse beats: a think pose and the "steady…" line…
  const poseDone = eventsOf(r, 'intent:complete').filter((e) => (e.payload as { verb: string }).verb === 'strikePose')
  expect(poseDone.length).toBeGreaterThanOrEqual(1)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'steady…')).toBe(true)
  // …the traverse arrives…
  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  // …and the onArrive cue fires its line ON the arrival tick.
  const arriveTick = eventsOf(r, 'intent:arrived')[0].tick
  const phew = eventsOf(r, 'intent:say').find((e) => (e.payload as { text: string }).text === 'phew — made it')
  expect(phew?.tick).toBe(arriveTick)
  expect(r.rt.behavior.status).toBe('complete')
})

test('a built-in (hop) is deterministic — run twice → identical trace', () => {
  function run() {
    const r = spawn(340)
    r.rt.runBehavior(HOP)
    driveUntilDone(r, 3000)
    for (let i = 0; i < 40; i++) step(r)
    return r.ctx.events.trace().map((e) => ({ tick: e.tick, type: e.type }))
  }
  expect(run()).toEqual(run())
})
