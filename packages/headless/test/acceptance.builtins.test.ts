// The three re-authored built-ins (hop / vault / tightrope) run THROUGH simulate()
// on the REAL notebook geometry — worldFromNotebook(notebook.pages)[0] is the INTRO
// page. Mirrors the engine-level semantics gate (packages/engine/test/
// behavior.builtins.test.ts) but at the public headless surface:
//   hop       = launch + land + arrive (jumpTo).
//   vault     = launch + an onLaunch flourish (cheer pose + whoosh) + onLand thud + arrive.
//   tightrope = a think-pose + "steady…" beat, a traverse, an onArrive "phew — made it".
//
// GOAL PLACEMENT (deterministic, computed from real panel geometry): INTRO panel:0:3
// is the axis-aligned box {x:432,y:448,w:200,h:160}; its roof segment is the horizontal
// line y=448 over x∈[432,632]. We stand Dash on that roof and place the goal 140px
// along it (well within the jump caps: maxJumpDistance 180), so every built-in launches
// and arrives inside its own timeout cap. Seed 7 — deterministic.
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { worldFromNotebook, type TraceEvent } from '@dash/engine'
import { simulate, type SimulateInput } from '../src/index'
import { dashSpec, loadBehavior, notebook } from './content'

// INTRO panel:0:3 roof geometry (axis-aligned; rotate is render-only per from-notebook).
const ROOF_Y = 448
const SPAWN_X = 470
const GOAL_X = 610 // 140px along the roof (roof spans x∈[432,632]) — within jump caps.

/** The INTRO page world with a reachable 'goal' entity added on panel:0:3's roof. */
function introWorldWithGoal(): WorldDocV2 {
  const page = worldFromNotebook(notebook.pages)[0]
  expect(page.name).toBe('INTRO') // guard: pages[0] is INTRO
  const world = structuredClone(page.world)
  world.entities.push({ id: 'goal', components: { transform: { x: GOAL_X, y: ROOF_Y } } })
  return world
}

function runBuiltin(name: string): { trace: TraceEvent[]; outcome: string } {
  const beh = loadBehavior(name)
  const input: SimulateInput = {
    world: introWorldWithGoal(),
    characters: [dashSpec({ initialTransform: { x: SPAWN_X, y: ROOF_Y - 100, rot: 0, facing: 1 }, initialFeetY: ROOF_Y })],
    behaviors: [beh],
    run: { characterId: 'dash', behaviorId: beh.id },
    seed: 7,
  }
  const res = simulate(input)
  return { trace: res.trace, outcome: res.outcome }
}

const tickOf = (trace: TraceEvent[], type: string) => trace.find((e) => e.type === type)?.tick
const of = (trace: TraceEvent[], type: string) => trace.filter((e) => e.type === type)

test('hop — launch + land + arrive on the INTRO roof (outcome "complete")', () => {
  const { trace, outcome } = runBuiltin('hop')
  expect(outcome).toBe('complete')
  const launch = tickOf(trace, 'jump:launch')
  const land = tickOf(trace, 'jump:land')
  const arrive = tickOf(trace, 'intent:arrived')
  expect(launch).toBeDefined()
  expect(land).toBeGreaterThan(launch!)
  expect(arrive).toBeGreaterThanOrEqual(land!)
})

test('vault — launch, an onLaunch flourish (cheer + whoosh), an onLand thud, arrive', () => {
  const { trace, outcome } = runBuiltin('vault')
  expect(outcome).toBe('complete')
  const launchTick = tickOf(trace, 'jump:launch')
  const landTick = tickOf(trace, 'jump:land')
  // the onLaunch flourish: a strikePose cue (cheer) + a whoosh sfx, both ON the launch tick.
  const flourish = of(trace, 'cue:strikePose')
  expect(flourish).toHaveLength(1)
  expect(flourish[0].tick).toBe(launchTick!)
  expect((flourish[0].payload as { ref: string }).ref).toBe('cheer')
  const whoosh = of(trace, 'intent:sfx').find((e) => (e.payload as { kind: string }).kind === 'whoosh')
  expect(whoosh?.tick).toBe(launchTick!)
  // the onLand thud fires ON the landing tick.
  const thud = of(trace, 'intent:sfx').find((e) => (e.payload as { kind: string }).kind === 'thud')
  expect(thud?.tick).toBe(landTick!)
  expect(of(trace, 'intent:arrived')).toHaveLength(1)
})

test('tightrope — a think pose + "steady…", a traverse, then an onArrive "phew — made it"', () => {
  const { trace, outcome } = runBuiltin('tightrope')
  expect(outcome).toBe('complete')
  // the pre-traverse beats: the think pose completes and the "steady…" line is said.
  const poseDone = of(trace, 'intent:complete').filter((e) => (e.payload as { verb: string }).verb === 'strikePose')
  expect(poseDone.length).toBeGreaterThanOrEqual(1)
  expect(of(trace, 'intent:say').some((e) => (e.payload as { text: string }).text === 'steady…')).toBe(true)
  // the traverse arrives…
  expect(of(trace, 'intent:arrived')).toHaveLength(1)
  // …and the onArrive cue fires its line ON the arrival tick.
  const arriveTick = tickOf(trace, 'intent:arrived')
  const phew = of(trace, 'intent:say').find((e) => (e.payload as { text: string }).text === 'phew — made it')
  expect(phew?.tick).toBe(arriveTick)
})

test('a built-in (hop) through simulate() is deterministic — run twice → identical trace', () => {
  const a = runBuiltin('hop')
  const b = runBuiltin('hop')
  expect(a.trace.map((e) => ({ tick: e.tick, type: e.type }))).toEqual(b.trace.map((e) => ({ tick: e.tick, type: e.type })))
})
