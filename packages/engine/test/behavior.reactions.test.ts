// Phase 7b — REACTIONS + CUES + SPEECH. The resume-vs-end policy, character-level
// default reactions (behavior-level wins), the say bubble, and milestone-scheduled
// performance cues running CONCURRENTLY with movement.
import { test, expect } from 'bun:test'
import type { WorldDocV2, CharacterDoc, BehaviorDoc } from '@dash/schema'
import { newRuntime, snapFeet, step, driveUntilDone, eventsOf, character, type Runtime } from './harness'

const FLOOR_Y = 300
function floorWorld(goalX = 380): WorldDocV2 {
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

function spawn(world: WorldDocV2, x: number, char?: CharacterDoc): Runtime {
  const r = newRuntime(world, { x, y: 0 }, char)
  snapFeet(r.rt, FLOOR_Y)
  return r
}

test('onArrive reaction CONTINUES the behavior (runs then the next step executes)', () => {
  const r = spawn(floorWorld(300), 150)
  const doc: BehaviorDoc = {
    schemaVersion: 2,
    id: 'arr',
    steps: [
      { verb: 'moveTo', target: 'entity:goal' },
      { verb: 'setFlag', flag: 'reachedSecond' }, // proves the behavior CONTINUED
    ],
    reactions: { onArrive: [{ verb: 'say', text: 'here!' }] },
  }
  r.rt.runBehavior(doc)
  driveUntilDone(r, 3000)

  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(eventsOf(r, 'reaction:run').some((e) => (e.payload as { trigger: string }).trigger === 'onArrive')).toBe(true)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'here!')).toBe(true)
  // the reaction ran AND the behavior continued to the setFlag step then completed.
  expect(r.rt.behavior.flags.reachedSecond).toBe(true)
  expect(r.rt.behavior.status).toBe('complete')
})

test('character-level DEFAULT reaction fires when the behavior has none; behavior-level WINS', () => {
  // char default onArrive says "default"; a behavior WITHOUT an onArrive uses it.
  const charWithDefault: CharacterDoc = { ...character, id: 'dash-def', reactions: { onArrive: [{ verb: 'say', text: 'default' }] } }
  const r1 = spawn(floorWorld(300), 150, charWithDefault)
  r1.rt.runBehavior({ schemaVersion: 2, id: 'noReact', steps: [{ verb: 'moveTo', target: 'entity:goal' }] })
  driveUntilDone(r1, 3000)
  expect(eventsOf(r1, 'intent:say').some((e) => (e.payload as { text: string }).text === 'default')).toBe(true)

  // a behavior WITH its own onArrive overrides the character default.
  const r2 = spawn(floorWorld(300), 150, charWithDefault)
  r2.rt.runBehavior({
    schemaVersion: 2,
    id: 'ownReact',
    steps: [{ verb: 'moveTo', target: 'entity:goal' }],
    reactions: { onArrive: [{ verb: 'say', text: 'mine' }] },
  })
  driveUntilDone(r2, 3000)
  const texts = eventsOf(r2, 'intent:say').map((e) => (e.payload as { text: string }).text)
  expect(texts).toContain('mine')
  expect(texts).not.toContain('default')
})

test('say sets a decaying speech bubble the renderer can read', () => {
  const r = spawn(floorWorld(), 200)
  r.rt.runBehavior({ schemaVersion: 2, id: 's', steps: [{ verb: 'say', text: 'hello' }, { verb: 'wait', ms: 2000 }] })
  step(r) // process the say step
  const sp = r.rt.speech()
  expect(sp?.text).toBe('hello')
  expect(sp!.remainingMs).toBeGreaterThan(0)
  // it decays and clears within its lifetime.
  for (let i = 0; i < 200; i++) step(r)
  expect(r.rt.speech()).toBeNull()
})

test('cues fire at milestones CONCURRENTLY, without pausing the movement', () => {
  // a jump with an onLaunch say cue + an onLand sfx cue. The cue must NOT enter the
  // step sequence: the single jumpTo step still completes (arrives) after landing.
  const world: WorldDocV2 = {
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
      { id: 'goal', components: { transform: { x: 340, y: FLOOR_Y } } },
    ],
  }
  const r = spawn(world, 200)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'cued',
    steps: [{ verb: 'jumpTo', target: 'entity:goal' }],
    cues: [
      { at: 'onLaunch', do: { verb: 'say', text: 'hup!' } },
      { at: 'onLand', do: { verb: 'sfx', kind: 'thud' } },
    ],
  })
  driveUntilDone(r, 3000)

  // the cues fired at their milestones…
  const launchTick = eventsOf(r, 'jump:launch')[0]?.tick
  const sayTick = eventsOf(r, 'intent:say').find((e) => (e.payload as { text: string }).text === 'hup!')?.tick
  const landTick = eventsOf(r, 'jump:land')[0]?.tick
  const sfxTick = eventsOf(r, 'intent:sfx').find((e) => (e.payload as { cue?: boolean }).cue)?.tick
  expect(sayTick).toBe(launchTick) // say cue fires on the SAME tick as the launch milestone
  expect(sfxTick).toBe(landTick)
  // …and the movement still completed (the cue ran concurrently, never paused it).
  expect(eventsOf(r, 'intent:arrived')).toHaveLength(1)
  expect(r.rt.behavior.status).toBe('complete')
})

test('NEGATIVE CONTROL: a bare blocked behavior (no onBlocked) blocks WITHOUT reaction events', () => {
  // enclosed against a wall, but the doc has NO reactions → proves the dispatcher reads
  // the doc rather than always reacting.
  const BOX = { x: 100, y: 100, w: 160, h: 160 }
  const world: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'cell',
        components: {
          transform: { x: BOX.x, y: BOX.y },
          surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } },
          collidable: { shape: 'segments', segments: require('../src/index').panelEdges(BOX) },
        },
      },
      { id: 'goal', components: { transform: { x: 500, y: BOX.y + BOX.h / 2 } } },
    ],
  }
  const r = newRuntime(world, { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 })
  snapFeet(r.rt, BOX.y + BOX.h / 2)
  r.rt.runBehavior({ schemaVersion: 2, id: 'bare', steps: [{ verb: 'moveTo', target: 'entity:goal' }] })
  driveUntilDone(r, 3000)

  expect(eventsOf(r, 'intent:blocked')).toHaveLength(1)
  expect(eventsOf(r, 'reaction:run')).toHaveLength(0)
  expect(eventsOf(r, 'intent:say')).toHaveLength(0)
  expect(r.rt.behavior.status).toBe('halted')
})

// ── review fixes: reaction retasking repair + branch-body reaction dispatch ────────

test('a CONTINUE reaction with its OWN movement (onDisturbed moveTo) — the parent resumes and arrives at ITS original target', () => {
  // mid-walk to a far goal, a disturbance fires a reaction containing a short moveTo
  // to a side spot. The reaction RETASKS the (single) locomotion solver; after it
  // drains, the parent movement must be re-begun toward the ORIGINAL goal — not
  // mistake the reaction's arrival for its own (the review blocker).
  const world = floorWorld(600)
  ;(world.entities as unknown[]).push({ id: 'side', components: { transform: { x: 260, y: FLOOR_Y } } } as never)
  const r = spawn(world, 150)
  const doc: BehaviorDoc = {
    schemaVersion: 2,
    id: 'disturb-move',
    steps: [
      { verb: 'moveTo', target: 'entity:goal' }, // goal at x=600
      { verb: 'setFlag', flag: 'reachedGoal' },
    ],
    reactions: { onDisturbed: [{ verb: 'moveTo', target: 'entity:side' }, { verb: 'say', text: 'huh?' }] },
  }
  r.rt.runBehavior(doc)
  // walk a bit, then the world disturbs the character.
  for (let i = 0; i < 60; i++) step(r)
  r.ctx.events.emit('disturbed', { entity: character.id })
  driveUntilDone(r, 8000)

  // the reaction ran (its own arrival + the say)…
  expect(eventsOf(r, 'reaction:run').some((e) => (e.payload as { trigger: string }).trigger === 'onDisturbed')).toBe(true)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'huh?')).toBe(true)
  // …and the PARENT resumed and arrived at ITS original target (x=600), completing.
  expect(r.rt.behavior.flags.reachedGoal).toBe(true)
  expect(r.rt.behavior.status).toBe('complete')
  expect(Math.abs(r.rt.transform.x - 600)).toBeLessThanOrEqual(6)
  // two arrivals traced: the reaction's side-trip and the parent's goal.
  expect(eventsOf(r, 'intent:arrived').length).toBe(2)
})

test('a movement inside a branchOnFlag BODY still fires onBlocked (gate = inReaction, not stack depth)', () => {
  const BOX = { x: 100, y: 100, w: 160, h: 160 }
  const world: WorldDocV2 = {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'cell',
        components: {
          transform: { x: BOX.x, y: BOX.y },
          surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } },
          collidable: { shape: 'segments', segments: require('../src/index').panelEdges(BOX) },
        },
      },
      { id: 'goal', components: { transform: { x: 500, y: BOX.y + BOX.h / 2 } } },
    ],
  }
  const r = newRuntime(world, { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 })
  snapFeet(r.rt, BOX.y + BOX.h / 2)
  r.rt.runBehavior({
    schemaVersion: 2,
    id: 'branch-blocked',
    steps: [
      { verb: 'setFlag', flag: 'go' },
      { verb: 'branchOnFlag', flag: 'go', then: [{ verb: 'moveTo', target: 'entity:goal' }] },
    ],
    reactions: { onBlocked: [{ verb: 'say', text: 'branch-ow' }] },
  } as BehaviorDoc)
  driveUntilDone(r, 3000)

  expect(eventsOf(r, 'intent:blocked')).toHaveLength(1)
  // the onBlocked reaction FIRED even though the movement ran inside a branch frame.
  expect(eventsOf(r, 'reaction:run').some((e) => (e.payload as { trigger: string }).trigger === 'onBlocked')).toBe(true)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'branch-ow')).toBe(true)
  expect(eventsOf(r, 'behavior:ended').some((e) => (e.payload as { reason: string }).reason === 'blocked')).toBe(true)
})
