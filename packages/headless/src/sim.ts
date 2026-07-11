import { tryValidateWorldV2, type WorldDocV2 } from '@dash/schema'
import { createContext, createLoop, hashState, STEP_MS, type EngineContext, type Loop, type TraceEvent } from '@dash/engine'

// ── inputs ───────────────────────────────────────────────────────────────────
// Scheduled inputs are the ONLY external energy source in the sim (besides the
// seeded RNG) — the same principle the Phase 5 impulse API will enforce.

export interface ImpulseInput {
  kind: 'impulse'
  entityId: string
  vec: [number, number]
}
export type Input = ImpulseInput

interface EntityState {
  id: string
  x: number
  y: number
}

/** Total serializable snapshot — enough to resume a bit-identical sim (§3 rule 1). */
export interface SimSnapshot {
  tick: number
  rng: number
  entities: EntityState[]
  pending: { tick: number; input: Input }[]
}

export interface Sim {
  /** Advance the sim exactly `n` fixed ticks. */
  step(n: number): void
  /** A deep, serializable snapshot of the full sim state. */
  snapshot(): SimSnapshot
  /** Bit-exact hash of the current state (tick + rng + entities). */
  hash(): string
  /** The ordered event trace since creation (or last restore). */
  trace(): readonly TraceEvent[]
  /** Queue an input to be applied when the clock reaches `tick`. */
  scheduleInput(tick: number, input: Input): void
  /** Reset the sim to a previously captured snapshot. */
  restore(snapshot: SimSnapshot): void
}

// Random-walk amplitude (px/axis/tick). Small enough that entities seeded near
// x = 0 re-cross the boundary many times over 10k ticks (→ plenty of events),
// yet large enough that a broken RNG/loop visibly changes the hash.
const STEP_JITTER = 0.5

export function createSim(worldDoc: WorldDocV2, opts?: { seed?: number }): Sim {
  const validated = tryValidateWorldV2(worldDoc)
  if (!validated.ok) throw new Error(`invalid WorldDocV2:\n- ${validated.errors.join('\n- ')}`)
  const world = validated.doc

  let ctx: EngineContext = createContext({ seed: opts?.seed ?? world.seed })
  // The Phase-1 placeholder dynamics only need a 2D position per entity; read it
  // from the real `transform` component (default 0,0 when absent). Everything else
  // about this file is still Phase-1 placeholder motion (see note below).
  let entities: EntityState[] = world.entities.map((e) => ({
    id: e.id,
    x: e.components.transform?.x ?? 0,
    y: e.components.transform?.y ?? 0,
  }))
  let scheduled = new Map<number, Input[]>()

  // ── PHASE 1 PLACEHOLDER DYNAMICS ───────────────────────────────────────────
  // Not gameplay. Just enough deterministic state motion — an RNG-driven walk,
  // scheduled impulse inputs, and boundary-cross events — that a broken RNG,
  // loop, event bus, or hash WOULD change the result. Phase 2+ replaces all of
  // this with the real L0–L6 pipeline.
  function tickOnce(): void {
    ctx.clock.advance()
    const now = ctx.clock.tick

    const inputs = scheduled.get(now)
    if (inputs) {
      for (const input of inputs) {
        const ent = entities.find((e) => e.id === input.entityId)
        if (ent) {
          ent.x += input.vec[0]
          ent.y += input.vec[1]
          ctx.events.emit('input', { id: ent.id, vec: input.vec })
        }
      }
    }

    for (const ent of entities) {
      const prevX = ent.x
      ent.x += ctx.rng.float() * 2 * STEP_JITTER - STEP_JITTER
      ent.y += ctx.rng.float() * 2 * STEP_JITTER - STEP_JITTER
      // Boundary at x = 0: emit when the walk crosses it in either direction.
      if ((prevX < 0 && ent.x >= 0) || (prevX >= 0 && ent.x < 0)) {
        ctx.events.emit('boundary', { id: ent.id, x: ent.x })
      }
    }
  }

  const loop: Loop = createLoop(tickOnce)

  function pendingList(): { tick: number; input: Input }[] {
    const out: { tick: number; input: Input }[] = []
    for (const [tick, inputs] of scheduled) for (const input of inputs) out.push({ tick, input })
    out.sort((a, b) => a.tick - b.tick)
    return out
  }

  function schedule(tick: number, input: Input): void {
    const list = scheduled.get(tick)
    if (list) list.push(input)
    else scheduled.set(tick, [input])
  }

  return {
    step(n) {
      // Drive one fixed step per advance() — exercises the accumulator while
      // guaranteeing exactly `n` ticks (each advance runs precisely one step).
      for (let i = 0; i < n; i++) loop.advance(STEP_MS)
    },
    snapshot() {
      return {
        tick: ctx.clock.tick,
        rng: ctx.rng.getState(),
        entities: entities.map((e) => ({ ...e })),
        pending: pendingList(),
      }
    },
    hash() {
      return hashState({ tick: ctx.clock.tick, rng: ctx.rng.getState(), entities })
    },
    trace() {
      return ctx.events.trace()
    },
    scheduleInput(tick, input) {
      schedule(tick, input)
    },
    restore(snapshot) {
      // Fresh context so the trace resets; RNG + clock are set from the snapshot,
      // making the resumed sim bit-identical to one that ran straight through.
      ctx = createContext({ seed: opts?.seed ?? world.seed })
      ctx.rng.setState(snapshot.rng)
      ctx.clock.setTick(snapshot.tick)
      entities = snapshot.entities.map((e) => ({ ...e }))
      scheduled = new Map<number, Input[]>()
      for (const { tick, input } of snapshot.pending) schedule(tick, input)
    },
  }
}
