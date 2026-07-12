// Phase 7b — RULE TABLE → INTENTS (#4). A RuleRow response may now be a full behavior
// `intent` targeted at the involved character; the world dispatcher emits `rule:intent`
// and the character runtime picks it up as a one-shot reaction. Plus the world→character
// reaction triggers (onProjectileHit) firing from bus events.
import { test, expect } from 'bun:test'
import type { WorldDocV2, BehaviorDoc, RuleRow } from '@dash/schema'
import { createRuleTable, dispatch, createContext, createVerletWorld, createMutableWorld } from '../src/index'
import { newRuntime, snapFeet, step, eventsOf, character } from './harness'

const FLOOR_Y = 300
function floorWorld(): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'F',
        components: {
          transform: { x: 0, y: FLOOR_Y },
          surface: { box: { x: 0, y: FLOOR_Y, w: 600, h: 20 }, anchor: { dx: 300, dy: 0 } },
          collidable: { shape: 'segments', segments: [{ x1: 0, y1: FLOOR_Y, x2: 600, y2: FLOOR_Y }] },
        },
      },
    ],
  }
}

test('dispatch of an `intent` response emits rule:intent targeted at the involved character', () => {
  const world = floorWorld()
  const ctx = createContext({ seed: 1 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(world, { character, events: ctx.events, stepMs: 1000 / 120 })
  const rows: RuleRow[] = [
    { a: 'locomotion', b: 'surface', event: 'blocked', responses: [{ kind: 'intent', do: { verb: 'say', text: 'ow' } }] },
  ]
  const table = createRuleTable(rows)
  const res = dispatch(
    { event: 'blocked', a: { entity: 'dash', kind: 'locomotion' }, b: { entity: 'F', kind: 'surface' } },
    table,
    mw,
    verlet,
  )
  const intentActions = res.actions.filter((a) => a.kind === 'intent')
  expect(intentActions).toHaveLength(1)
  expect((intentActions[0] as { entity: string }).entity).toBe('dash') // the locomotion party
  // the bus carried a rule:intent naming the character.
  const emitted = ctx.events.trace().filter((e) => e.type === 'rule:intent')
  expect(emitted).toHaveLength(1)
  expect((emitted[0].payload as { entity: string }).entity).toBe('dash')
})

test('a running character executes a rule:intent aimed at it (one-shot reaction)', () => {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  const charId = character.id
  r.rt.runBehavior({ schemaVersion: 2, id: 'idleWait', steps: [{ verb: 'wait', ms: 3000 }] })
  step(r)
  // world fires a rule:intent at this character (as the dispatcher would).
  r.ctx.events.emit('rule:intent', { entity: charId, intent: { verb: 'say', text: 'zap!' } })
  for (let i = 0; i < 10; i++) step(r)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'zap!')).toBe(true)
  // and the underlying wait resumes (behavior still running / not wedged).
  expect(r.rt.running()).toBe(true)
})

test('onProjectileHit reaction fires from a projectileHit bus event naming the character', () => {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  const doc: BehaviorDoc = {
    schemaVersion: 2,
    id: 'patrol',
    steps: [{ verb: 'wait', ms: 3000 }],
    reactions: { onProjectileHit: [{ verb: 'say', text: 'hit!' }, { verb: 'sfx', kind: 'zap' }] },
  }
  r.rt.runBehavior(doc)
  step(r)
  // a projectile strikes the character (as the projectile sim / rule table would emit).
  r.ctx.events.emit('projectileHit', { entity: character.id, projectile: 'laser1' })
  for (let i = 0; i < 10; i++) step(r)
  expect(eventsOf(r, 'reaction:run').some((e) => (e.payload as { trigger: string }).trigger === 'onProjectileHit')).toBe(true)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'hit!')).toBe(true)
  expect(r.rt.running()).toBe(true) // continue reaction: the behavior resumes
})

// ── review fix: IDLE characters execute rule intents + character-default reactions ─

test('an IDLE character executes a rule:intent aimed at it (ephemeral one-shot, then re-idles)', () => {
  const r = newRuntime(floorWorld(), { x: 200, y: 0 })
  snapFeet(r.rt, FLOOR_Y)
  // NO behavior running at all.
  expect(r.rt.running()).toBe(false)
  r.ctx.events.emit('rule:intent', { entity: character.id, intent: { verb: 'say', text: 'zap-idle!' } })
  for (let i = 0; i < 10; i++) step(r)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'zap-idle!')).toBe(true)
  // the ephemeral run ended; back to idle.
  expect(r.rt.running()).toBe(false)
  expect(eventsOf(r, 'behavior:ended').some((e) => (e.payload as { reason: string }).reason === 'idle:rule-intent')).toBe(true)
})

test('a projectile hitting an IDLE character fires its character-DEFAULT onProjectileHit', () => {
  const charWithDefault = {
    ...character,
    id: character.id,
    reactions: { onProjectileHit: [{ verb: 'say' as const, text: 'idle-hit!' }] },
  }
  const r = newRuntime(floorWorld(), { x: 200, y: 0 }, charWithDefault)
  snapFeet(r.rt, FLOOR_Y)
  expect(r.rt.running()).toBe(false)
  r.ctx.events.emit('projectileHit', { entity: character.id, projectile: 'laser9' })
  for (let i = 0; i < 10; i++) step(r)
  const reactions = eventsOf(r, 'reaction:run')
  expect(reactions.some((e) => (e.payload as { trigger: string; idle?: boolean }).trigger === 'onProjectileHit')).toBe(true)
  expect(eventsOf(r, 'intent:say').some((e) => (e.payload as { text: string }).text === 'idle-hit!')).toBe(true)
  // returned to idle after the one-shot.
  expect(r.rt.running()).toBe(false)
})
