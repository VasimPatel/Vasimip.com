// ─────────────────────────────────────────────────────────────────────────────
// requireOwner — the real auth boundary for every mutating notebook route.
// Reads the Better Auth session from the request cookies; 401 with no session,
// 403 if the session's user isn't the owner. Replaces the old x-admin-token stub.
// ─────────────────────────────────────────────────────────────────────────────
import type { Context, MiddlewareHandler, Next } from 'hono'
import { getConnInfo } from 'hono/bun'
import { auth } from './auth'

/** Hono env for routes behind requireOwner — `c.get('userEmail')` is the
 *  authenticated owner's email, for audit fields (revision createdBy etc.). */
export type OwnerEnv = { Variables: { userEmail: string } }

const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase() ?? ''

export async function requireOwner(c: Context<OwnerEnv>, next: Next): Promise<Response | void> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ errors: ['unauthorized'] }, 401)
  if (session.user.email.toLowerCase() !== OWNER_EMAIL) {
    return c.json({ errors: ['forbidden'] }, 403)
  }
  c.set('userEmail', session.user.email) // audit fields (revision createdBy etc.)
  return next()
}

/** Client IP for rate limiting, shared by the pg-backed submission limiter and
 *  the in-memory public-read limiter. Trust model: the RIGHTMOST
 *  x-forwarded-for hop is the one appended by the trusted proxy in front of us
 *  (Railway) — the leftmost hops are client-supplied and spoofable (codex
 *  finding: first-hop keying let clients rotate fake IPs). With no XFF at all
 *  (direct-to-Bun), key on the actual socket peer so anonymous clients don't
 *  all share one bucket. */
export function clientIp(c: Context): string {
  const xff = c.req.raw.headers.get('x-forwarded-for')
  if (xff) {
    const hops = xff.split(',')
    const last = hops[hops.length - 1].trim()
    if (last) return last
  }
  try {
    const addr = getConnInfo(c).remote.address
    if (addr) return addr
  } catch {
    // not running under the Bun server adapter (tests) — fall through
  }
  return c.req.raw.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** A positive finite integer from the env, else the default (a malformed knob
 *  must degrade to the default, never disable or brick the limiter). */
function posInt(raw: string | undefined, def: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def
}

// ── publicRateLimit — a light per-IP sliding window for the PUBLIC read routes
// (GET /api/notebook, GET /api/invite/:token). In-memory is deliberate: the app
// runs as ONE Bun process on Railway, these routes serve already-public
// read-only data, and losing the window on restart costs nothing. The WRITE
// path keeps the durable pg-backed limiter in routes/invites.ts. ─────────────
const READ_RATE_MAX = posInt(process.env.PUBLIC_GET_RATE_MAX, 120)
const READ_RATE_WINDOW_MS = posInt(process.env.PUBLIC_GET_RATE_WINDOW_MS, 60_000)
/** Hard cap on distinct buckets: a flood of spoofed keys resets the map rather
 *  than growing it without bound (accuracy under attack < bounded memory). */
const MAX_BUCKETS = 5000
const readBuckets = new Map<string, number[]>()
let lastSweep = 0

// MiddlewareHandler (not a bare Context signature) so route-path param
// inference survives — `app.get('/invite/:token', publicRateLimit, h)` must
// still type `c.req.param('token')` as string in the handler.
export const publicRateLimit: MiddlewareHandler = async (c, next) => {
  const now = Date.now()
  // sweep idle buckets once per window so abandoned IPs can't grow the map
  if (now - lastSweep > READ_RATE_WINDOW_MS) {
    lastSweep = now
    for (const [key, times] of readBuckets) {
      if (times.length === 0 || times[times.length - 1] <= now - READ_RATE_WINDOW_MS) readBuckets.delete(key)
    }
  }
  const key = clientIp(c)
  const cutoff = now - READ_RATE_WINDOW_MS
  let times = readBuckets.get(key)
  if (!times) {
    if (readBuckets.size >= MAX_BUCKETS) readBuckets.clear()
    times = []
    readBuckets.set(key, times)
  }
  while (times.length > 0 && times[0] <= cutoff) times.shift()
  if (times.length >= READ_RATE_MAX) {
    c.header('retry-after', String(Math.max(1, Math.ceil((times[0] + READ_RATE_WINDOW_MS - now) / 1000))))
    return c.json({ errors: ['rate limited'] }, 429)
  }
  times.push(now)
  return next()
}
