// Shared Phase 7a runtime harness — the validated character-runtime construction
// pattern, factored once (content loaders already live in ./content). DOM-free,
// deterministic. Each gate test drives ctx.clock + rt.tick + verlet.step itself.
import { readFileSync } from 'node:fs'
import { expect } from 'bun:test'
import type { WorldDocV2, CharacterDoc } from '@dash/schema'
import {
  createContext,
  createVerletWorld,
  createMutableWorld,
  createCharacterRuntime,
  type CharacterRuntimeOptions,
} from '../src/index'
import { loadRig, loadCharacter, loadPose, loadClip } from './content'

export const rig = loadRig()
export const character = loadCharacter()

export const clips = {
  jump: loadClip('jump', rig),
  'idle-shuffle': loadClip('idle-shuffle', rig),
  'walk-cycle': loadClip('walk-cycle', rig),
}
export const poses = {
  'jump-tuck': loadPose('jump-tuck', rig),
  'squash-land': loadPose('squash-land', rig),
  stand: loadPose('stand', rig),
  cheer: loadPose('cheer', rig),
  think: loadPose('think', rig),
}
export const names = { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' }

/** Sim step in ms (120 Hz) — matches the engine STEP_MS. */
export const STEP = 1000 / 120

/** The real committed notebook (5 pages); worldFromNotebook(notebook.pages). */
export const notebook = JSON.parse(readFileSync(new URL('../../../src/notebook/notebook.json', import.meta.url), 'utf8'))

type RuntimeExtra = Partial<Pick<CharacterRuntimeOptions, 'resolveVerletBody' | 'secondaryId' | 'behaviors' | 'watchdog' | 'giveUp'>>

export interface Runtime {
  ctx: ReturnType<typeof createContext>
  verlet: ReturnType<typeof createVerletWorld>
  mw: ReturnType<typeof createMutableWorld>
  rt: ReturnType<typeof createCharacterRuntime>
}

/** Build a character runtime over `world`, spawned at `tx`, seed 7 (deterministic). */
export function newRuntime(
  world: WorldDocV2,
  tx: { x: number; y: number },
  char: CharacterDoc = character,
  extra: RuntimeExtra = {},
): Runtime {
  const ctx = createContext({ seed: 7 })
  const verlet = createVerletWorld()
  const mw = createMutableWorld(world, { character: char, events: ctx.events, stepMs: STEP })
  const rt = createCharacterRuntime({
    rig,
    character: char,
    world: mw,
    verlet,
    rng: ctx.rng,
    events: ctx.events,
    clips,
    poses,
    names,
    restPose: poses.stand,
    initialTransform: { x: tx.x, y: tx.y, rot: 0, facing: 1 },
    ...extra,
  })
  return { ctx, verlet, mw, rt }
}

/** Snap the character's feet (capsule bottom) onto floor line `floorY`. */
export function snapFeet(rt: Runtime['rt'], floorY: number): void {
  const c = rt.capsule()
  rt.transform.y += floorY - (c.y1 + c.r)
}

/** Advance one full sim tick: clock, character, verlet, and heal timers. */
export function step(r: Runtime): void {
  r.ctx.clock.advance()
  r.rt.tick()
  r.verlet.step()
  r.mw.stepMutations()
}

/** Drive until the behavior stops running or `cap` ticks elapse. Returns tick count. */
export function driveUntilDone(r: Runtime, cap = 3000): number {
  let n = 0
  for (; n < cap; n++) {
    step(r)
    if (!r.rt.running()) break
  }
  return n
}

/** Trace events of a given type. */
export function eventsOf(r: Runtime, type: string) {
  return r.ctx.events.trace().filter((e) => e.type === type)
}

/** Drive until the behavior stops running, like driveUntilDone — but a wedge (still
 * running when `cap` is exhausted) FAILS LOUDLY instead of passing silently. Use this
 * wherever a behavior is EXPECTED to complete/halt; the whole point of the P7a
 * hardening is that no bounded scenario may hang forever. Returns the tick count. */
export function driveToCompletion(r: Runtime, cap = 3000): number {
  const n = driveUntilDone(r, cap)
  if (r.rt.running()) {
    // A wedge: the behavior never released within the cap. Surface it as a failed
    // expectation with a legible message rather than a silent green.
    expect(`behavior still running after ${cap} ticks (wedge)`).toBe('behavior completed within cap')
  }
  return n
}

/** After a halt (blocked/failed/complete), assert the character is truly at rest:
 * `ticks` more steps move the transform < 0.5px AND emit no new `intent:*` events.
 * A halt that keeps drifting or re-firing intents is a latent wedge — this catches it. */
export function assertHaltStable(r: Runtime, ticks = 120): void {
  const x0 = r.rt.transform.x
  const y0 = r.rt.transform.y
  const intentsBefore = r.ctx.events.trace().filter((e) => e.type.startsWith('intent:')).length
  for (let i = 0; i < ticks; i++) step(r)
  const intentsAfter = r.ctx.events.trace().filter((e) => e.type.startsWith('intent:')).length
  expect(Math.abs(r.rt.transform.x - x0)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(r.rt.transform.y - y0)).toBeLessThanOrEqual(0.5)
  expect(intentsAfter).toBe(intentsBefore) // no new intent:* events during the window
}
