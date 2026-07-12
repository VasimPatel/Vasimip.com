// ─────────────────────────────────────────────────────────────────────────────
// POST /api/validate + POST /api/simulate — the engine's FIRST server integration
// (ENGINE_V2 Phase 8). Both are OWNER-GATED (requireOwner): they exist for the
// admin/editor save + dry-run flow, NOT the public. Bun runs the same @dash/*
// packages the CI harness does, so a server simulate is byte-identical to a local
// one (§3 rule 1 — same runtime).
//
// Defense in depth (behind auth, but still): a 256 KB per-route bodyLimit, a
// server-side maxTicks clamp (≤ SERVER_MAX_TICKS regardless of the request),
// simulate()'s own up-front complexity caps (MAX_ENTITIES etc. — over-cap payloads
// throw fast → 400 below, before any cloning/construction), and a wall-clock guard.
// The guard is a route-layer shouldAbort closure reading Date.now (legal HERE) —
// simulate() checks it BETWEEN construction stages as well as between ticks, so the
// deadline bounds the WHOLE call, setup included. The engine stays deterministic/
// tick-based and never sees a clock; this only catches runaway CONTENT, it can never
// change a valid sim's result.
// ─────────────────────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { validate, simulate, DEFAULT_MAX_TICKS, type SimulateInput } from '@dash/headless'
import { requireOwner, type OwnerEnv } from '../middleware'

/** Server never simulates past this, whatever maxTicks the request asks for. */
export const SERVER_MAX_TICKS = 20_000
/** Per-route body cap for the engine endpoints (a sim/doc body is small). */
export const ENGINE_BODY_LIMIT = 256 * 1024
/** Wall-clock budget for a single simulate call; exceeding it → 422 (runaway guard). */
export const SIM_WALL_MS = 2000

const engine = new Hono<OwnerEnv>()

engine.post('/validate', requireOwner, bodyLimit({ maxSize: ENGINE_BODY_LIMIT }), async (c) => {
  const body = (await c.req.json().catch(() => null)) as { doc?: unknown } | null
  if (!body || !('doc' in body)) return c.json({ errors: ['body must be { doc }'] }, 400)
  return c.json(validate(body.doc))
})

engine.post('/simulate', requireOwner, bodyLimit({ maxSize: ENGINE_BODY_LIMIT }), async (c) => {
  const input = (await c.req.json().catch(() => null)) as SimulateInput | null
  if (!input || typeof input !== 'object' || !('world' in input)) {
    return c.json({ errors: ['body must be a simulate input with a `world`'] }, 400)
  }

  // Clamp maxTicks server-side (defense in depth) — the request can lower it but never
  // raise it above SERVER_MAX_TICKS.
  const requested = Number((input as { maxTicks?: unknown }).maxTicks)
  const maxTicks = Math.min(Number.isFinite(requested) ? requested : DEFAULT_MAX_TICKS, SERVER_MAX_TICKS)

  const deadline = Date.now() + SIM_WALL_MS
  try {
    const res = simulate({ ...input, maxTicks }, { shouldAbort: () => Date.now() > deadline })
    if (res.outcome === 'aborted') {
      // Runaway content: return a partial-trace summary, not the (possibly huge) trace.
      return c.json({ errors: ['simulate exceeded the wall-clock budget'], aborted: true, ticks: res.ticks, traceLength: res.trace.length }, 422)
    }
    return c.json(res)
  } catch (e) {
    // Invalid world/nested doc, bad run target, or over-cap payload → caller error, not 500.
    return c.json({ errors: [(e as Error).message] }, 400)
  }
})

export default engine
