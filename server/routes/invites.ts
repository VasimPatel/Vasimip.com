// ─────────────────────────────────────────────────────────────────────────────
// Invites + friend submissions.
//
// Owner routes (requireOwner): create / list / revoke invites, list submissions,
// approve / reject. Public routes: fetch an invite's public info by token, and
// POST a submission against a token. The public write is the only unauthenticated
// mutation on the whole server, so it is fenced hard:
//   · a 64 KB body cap (route-level, tighter than the global 1 MB),
//   · the subset validator (validateSubmissionPanel — text+draw content only),
//   · a per-token AND per-IP sliding-window rate limit (pg counts; IP is hashed,
//     never stored raw),
//   · a transactional use_count bump guarded by the invite's own validity so it
//     can't be raced past max_uses.
//
// Enumeration safety: EVERY invalid/revoked/expired/exhausted case answers with the
// SAME uniform 404 body — a probe can't distinguish "wrong token" from "used up".
// ─────────────────────────────────────────────────────────────────────────────
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { and, count, desc, eq, gt, gte, isNull, lt, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../db'
import { invites, submissions } from '../db/schema'
import { validateSubmissionPanel } from '../../src/notebook/doc/submission'
import { requireOwner, type OwnerEnv } from '../middleware'

const app = new Hono<OwnerEnv>()

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787'
const SALT = process.env.BETTER_AUTH_SECRET || 'dev-salt'
// Rate-limit knobs (env-overridable so the harness can shrink the window/caps).
const RATE_WINDOW_MS = Number(process.env.SUBMISSION_RATE_WINDOW_MS) || 60 * 60 * 1000
const MAX_PER_TOKEN = Number(process.env.SUBMISSION_RATE_PER_TOKEN) || 5
const MAX_PER_IP = Number(process.env.SUBMISSION_RATE_PER_IP) || 10

// Uniform 404 — same body for every "no usable invite" reason (no oracle).
const NOT_FOUND = { valid: false } as const

/** 22-char base64url token from 128 bits of CSPRNG entropy. */
function newToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

/** sha256(ip + server secret) — a stable per-IP key that never reveals the IP. */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip + SALT).digest('hex')
}

function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

type InviteRow = typeof invites.$inferSelect
type InviteStatus = 'active' | 'expired' | 'revoked' | 'exhausted'

function inviteStatus(inv: Pick<InviteRow, 'revokedAt' | 'expiresAt' | 'maxUses' | 'useCount'>, now = Date.now()): InviteStatus {
  if (inv.revokedAt) return 'revoked'
  if (inv.expiresAt && inv.expiresAt.getTime() <= now) return 'expired'
  if (inv.maxUses != null && inv.useCount >= inv.maxUses) return 'exhausted'
  return 'active'
}

// ── Owner: create / list / revoke ──────────────────────────────────────────
app.post('/invites', requireOwner, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { label?: unknown; expiresInDays?: unknown; maxUses?: unknown }
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : null
  const expiresInDays = Number.isFinite(body.expiresInDays as number) ? Math.max(0, Number(body.expiresInDays)) : 14
  const maxUses = Number.isFinite(body.maxUses as number) ? Math.max(1, Math.floor(Number(body.maxUses))) : 5
  const expiresAt = expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86_400_000) : null

  const token = newToken()
  const [row] = await db.insert(invites).values({ token, label, expiresAt, maxUses }).returning({ id: invites.id })
  return c.json({ id: row.id, url: `${BASE_URL}/make-a-panel/${token}` }, 201)
})

app.get('/invites', requireOwner, async (c) => {
  const rows = await db
    .select({
      id: invites.id,
      token: invites.token,
      label: invites.label,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      useCount: invites.useCount,
      revokedAt: invites.revokedAt,
      createdAt: invites.createdAt,
      submissionCount: sql<number>`count(${submissions.id})::int`,
      pendingCount: sql<number>`count(*) filter (where ${submissions.status} = 'pending')::int`,
    })
    .from(invites)
    .leftJoin(submissions, eq(submissions.inviteId, invites.id))
    .groupBy(invites.id)
    .orderBy(desc(invites.id))

  return c.json(rows.map((r) => ({
    ...r,
    status: inviteStatus(r),
    url: `${BASE_URL}/make-a-panel/${r.token}`,
  })))
})

app.delete('/invites/:id', requireOwner, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ errors: ['invalid invite id'] }, 400)
  const [row] = await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, id)).returning({ id: invites.id })
  if (!row) return c.json({ errors: ['invite not found'] }, 404)
  return c.json({ ok: true })
})

// ── Owner: submissions inbox ────────────────────────────────────────────────
app.get('/submissions', requireOwner, async (c) => {
  const status = c.req.query('status')
  const where = (status === 'pending' || status === 'approved' || status === 'rejected')
    ? eq(submissions.status, status)
    : undefined
  const rows = await db
    .select({
      id: submissions.id,
      inviteId: submissions.inviteId,
      inviteLabel: invites.label,
      authorName: submissions.authorName,
      panel: submissions.panel,
      status: submissions.status,
      createdAt: submissions.createdAt,
      reviewedAt: submissions.reviewedAt,
    })
    .from(submissions)
    .leftJoin(invites, eq(submissions.inviteId, invites.id))
    .where(where)
    .orderBy(desc(submissions.createdAt))
  return c.json(rows)
})

async function review(c: Context<OwnerEnv>, status: 'approved' | 'rejected') {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ errors: ['invalid submission id'] }, 400)
  const [row] = await db.update(submissions).set({ status, reviewedAt: new Date() }).where(eq(submissions.id, id)).returning({ id: submissions.id })
  if (!row) return c.json({ errors: ['submission not found'] }, 404)
  return c.json({ ok: true })
}
app.post('/submissions/:id/approve', requireOwner, (c) => review(c, 'approved'))
app.post('/submissions/:id/reject', requireOwner, (c) => review(c, 'rejected'))

// ── Public: token info ──────────────────────────────────────────────────────
app.get('/invite/:token', async (c) => {
  const token = c.req.param('token')
  const [inv] = await db.select().from(invites).where(eq(invites.token, token)).limit(1)
  if (!inv || inviteStatus(inv) !== 'active') return c.json(NOT_FOUND, 404)
  return c.json({ valid: true, label: inv.label ?? undefined })
})

// ── Public: submit a panel ──────────────────────────────────────────────────
app.post('/invite/:token/submissions', bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
  const token = c.req.param('token')
  const body = await c.req.json().catch(() => null) as { authorName?: unknown; panel?: unknown } | null
  if (!body) return c.json({ errors: ['body must be JSON { authorName, panel }'] }, 400)

  const [inv] = await db.select().from(invites).where(eq(invites.token, token)).limit(1)
  if (!inv || inviteStatus(inv) !== 'active') return c.json(NOT_FOUND, 404)

  const ipHash = hashIp(clientIp(c.req.raw.headers))

  // Content + author validation (no db) — a bad body never enters the tx.
  const errors: string[] = []
  const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : ''
  if (authorName.length < 1 || authorName.length > 40) errors.push('authorName: must be 1..40 characters')
  const validated = validateSubmissionPanel(body.panel)
  if (!validated.ok) errors.push(...validated.errors)
  if (errors.length > 0) return c.json({ errors }, 400)

  // Critical section: the sliding-window counts, the validity-guarded use_count
  // bump, and the submission INSERT all run in ONE transaction that first takes
  // per-token AND per-IP advisory xact locks — so parallel submissions serialize
  // and can't both read a stale count and slip past the rate limit / max_uses.
  const since = new Date(Date.now() - RATE_WINDOW_MS)
  type Outcome =
    | { status: 201 }
    | { status: 429; msg: string }
    | { status: 404 }
  const outcome = await db.transaction<Outcome>(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${token}))`)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ipHash}))`)

    const [byToken] = await tx.select({ n: count() }).from(submissions).where(and(eq(submissions.inviteId, inv.id), gte(submissions.createdAt, since)))
    if (byToken.n >= MAX_PER_TOKEN) return { status: 429, msg: 'too many submissions for this invite — try again later' }
    const [byIp] = await tx.select({ n: count() }).from(submissions).where(and(eq(submissions.ipHash, ipHash), gte(submissions.createdAt, since)))
    if (byIp.n >= MAX_PER_IP) return { status: 429, msg: 'too many submissions from your network — try again later' }

    const bumped = await tx
      .update(invites)
      .set({ useCount: sql`${invites.useCount} + 1` })
      .where(and(
        eq(invites.id, inv.id),
        isNull(invites.revokedAt),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
        or(isNull(invites.maxUses), lt(invites.useCount, invites.maxUses)),
      ))
      .returning({ id: invites.id })
    if (bumped.length === 0) return { status: 404 }
    await tx.insert(submissions).values({
      inviteId: inv.id,
      authorName: authorName.slice(0, 40),
      panel: (validated as { ok: true; panel: unknown }).panel,
      ipHash,
    })
    return { status: 201 }
  })

  if (outcome.status === 429) return c.json({ errors: [outcome.msg] }, 429)
  if (outcome.status === 404) return c.json(NOT_FOUND, 404)
  return c.json({ ok: true }, 201)
})

export default app
