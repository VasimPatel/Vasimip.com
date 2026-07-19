// ─────────────────────────────────────────────────────────────────────────────
// GET/PUT /api/notebook + GET /api/revisions + POST /api/revisions/:id/restore.
// Every save is a new `notebook_revisions` row; `notebook_current` is a
// singleton pointer. `baseRevisionId` mismatch on PUT → 409 (two-device safety).
//
// GET /notebook is public; every mutating/owner route is gated by `requireOwner`
// (Better Auth session → owner email). See server/middleware.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { and, eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { notebookRevisions, notebookCurrent } from '../db/schema'
import { tryValidateDoc } from '../../src/notebook/doc/validate'
import { publicRateLimit, requireOwner, type OwnerEnv } from '../middleware'

// ── schemaVersion dispatch (P8, tightened by review) ─────────────────────────────
// V1-FIRST: any doc carrying the v1 discriminator (`version: 1` — required by the
// legacy validator) routes to tryValidateDoc EXACTLY as before, even with a stray
// `schemaVersion` field — every previously-accepted v1 doc keeps byte-identical
// behavior. Only docs WITHOUT the v1 discriminator are considered v2.
//
// V2 SAVES ARE REJECTED until the P9 migration: the notebook_current pointer feeds
// the PUBLIC GET and the admin's v1 editor, so ANY v2 artifact stored there (world
// or otherwise) would break the live site — and restore could reintroduce it. The
// v2 validate/dry-run capability P10's editors need is served by the owner-gated
// POST /api/validate + /api/simulate (server/routes/engine.ts). P9 owns the cutover
// and will replace this rejection with the migration path.
function isLegacyV1(doc: unknown): boolean {
  return typeof doc === 'object' && doc !== null && (doc as { version?: unknown }).version === 1
}
function isSchemaV2(doc: unknown): boolean {
  return typeof doc === 'object' && doc !== null && (doc as { schemaVersion?: unknown }).schemaVersion === 2
}

const notebook = new Hono<OwnerEnv>()

// Thrown inside a save/restore transaction when the atomic compare-and-swap on
// `notebook_current` matches 0 rows (someone else moved the pointer since the
// caller's baseRevisionId) → the tx rolls back and the route answers 409.
class RevisionConflict extends Error {}

async function getCurrent(): Promise<{ revisionId: number; doc: unknown } | null> {
  const rows = await db
    .select({ revisionId: notebookCurrent.revisionId, doc: notebookRevisions.doc })
    .from(notebookCurrent)
    .innerJoin(notebookRevisions, eq(notebookCurrent.revisionId, notebookRevisions.id))
    .where(eq(notebookCurrent.id, 1))
    .limit(1)
  return rows[0] ?? null
}

// If-None-Match may carry a weak prefix, quotes, `*`, or a comma-list of tags —
// parse tolerantly and match against the current revision id.
function ifNoneMatchHit(header: string | undefined, revisionId: number): boolean {
  if (!header) return false
  const target = String(revisionId)
  return header.split(',').some((raw) => {
    const tag = raw.trim().replace(/^W\//i, '').replace(/^"(.*)"$/, '$1')
    return tag === '*' || tag === target
  })
}

notebook.get('/notebook', publicRateLimit, async (c) => {
  const current = await getCurrent()
  if (!current) return c.json({ errors: ['no notebook doc seeded'] }, 500)

  if (ifNoneMatchHit(c.req.header('if-none-match'), current.revisionId)) return c.body(null, 304)

  c.header('ETag', `"${current.revisionId}"`)
  return c.json({ doc: current.doc, revisionId: current.revisionId })
})

notebook.put('/notebook', requireOwner, async (c) => {
  const body = await c.req.json().catch(() => null) as { doc?: unknown; baseRevisionId?: unknown; note?: unknown } | null
  if (!body || typeof body.baseRevisionId !== 'number') {
    return c.json({ errors: ['body must be { doc, baseRevisionId, note? }'] }, 400)
  }

  // V1-FIRST dispatch, then the v2 gate — see the header comment above. Everything
  // that is not explicitly v2 keeps the legacy validator EXACTLY as-is.
  if (!isLegacyV1(body.doc) && isSchemaV2(body.doc)) {
    return c.json(
      {
        errors: [
          'v2 docs cannot be saved as the notebook yet — v2 content storage lands with the P9 migration. Use POST /api/validate and POST /api/simulate to validate/dry-run v2 content.',
        ],
      },
      422,
    )
  }
  const result = tryValidateDoc(body.doc)
  if (!result.ok) return c.json({ errors: result.errors }, 400)
  const docToStore: unknown = result.doc

  const note = typeof body.note === 'string' ? body.note : null
  const baseRevisionId = body.baseRevisionId

  try {
    const revisionId = await db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(notebookRevisions)
        .values({ doc: docToStore, note, createdBy: c.get('userEmail') ?? 'owner' })
        .returning({ id: notebookRevisions.id })
      // Atomic compare-and-swap: only advance the pointer if it still points at
      // the revision the caller based their edit on. 0 rows → a concurrent save
      // won the race → roll back (throw) and 409 with a fresh read.
      const swapped = await tx
        .update(notebookCurrent)
        .set({ revisionId: revision.id })
        .where(and(eq(notebookCurrent.id, 1), eq(notebookCurrent.revisionId, baseRevisionId)))
        .returning({ id: notebookCurrent.id })
      if (swapped.length === 0) throw new RevisionConflict()
      return revision.id
    })
    return c.json({ revisionId })
  } catch (e) {
    if (e instanceof RevisionConflict) {
      const fresh = await getCurrent()
      return c.json({ currentRevisionId: fresh?.revisionId ?? null }, 409)
    }
    throw e
  }
})

notebook.get('/revisions', requireOwner, async (c) => {
  const rows = await db
    .select({
      id: notebookRevisions.id,
      note: notebookRevisions.note,
      createdBy: notebookRevisions.createdBy,
      createdAt: notebookRevisions.createdAt,
    })
    .from(notebookRevisions)
    .orderBy(desc(notebookRevisions.id))
    .limit(50)

  return c.json(rows)
})

notebook.post('/revisions/:id/restore', requireOwner, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ errors: ['invalid revision id'] }, 400)

  // Optional baseRevisionId: when the admin sends the revision its draft is based
  // on we CAS against it (409 on a concurrent move); when absent (e.g. the dev
  // mock) we restore unconditionally — backward compatible.
  const body = await c.req.json().catch(() => null) as { baseRevisionId?: unknown } | null
  const baseRevisionId = body && typeof body.baseRevisionId === 'number' ? body.baseRevisionId : null

  const rows = await db.select({ doc: notebookRevisions.doc }).from(notebookRevisions).where(eq(notebookRevisions.id, id)).limit(1)
  const old = rows[0]
  if (!old) return c.json({ errors: [`revision ${id} not found`] }, 404)

  try {
    const revisionId = await db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(notebookRevisions)
        .values({ doc: old.doc, note: `restore of #${id}`, createdBy: c.get('userEmail') ?? 'owner' })
        .returning({ id: notebookRevisions.id })
      const where = baseRevisionId == null
        ? eq(notebookCurrent.id, 1)
        : and(eq(notebookCurrent.id, 1), eq(notebookCurrent.revisionId, baseRevisionId))
      const swapped = await tx
        .update(notebookCurrent)
        .set({ revisionId: revision.id })
        .where(where)
        .returning({ id: notebookCurrent.id })
      if (swapped.length === 0) throw new RevisionConflict()
      return revision.id
    })
    return c.json({ revisionId })
  } catch (e) {
    if (e instanceof RevisionConflict) {
      const fresh = await getCurrent()
      return c.json({ currentRevisionId: fresh?.revisionId ?? null }, 409)
    }
    throw e
  }
})

export default notebook
