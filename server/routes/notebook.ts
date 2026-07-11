// ─────────────────────────────────────────────────────────────────────────────
// GET/PUT /api/notebook + GET /api/revisions + POST /api/revisions/:id/restore.
// Every save is a new `notebook_revisions` row; `notebook_current` is a
// singleton pointer. `baseRevisionId` mismatch on PUT → 409 (two-device safety).
//
// TEMP AUTH STUB: mutating routes require header `x-admin-token` to match env
// `ADMIN_DEV_TOKEN`. This is replaced by Better Auth's `requireOwner` in step 2
// of the plan — do not build on top of this beyond that point.
// ─────────────────────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { notebookRevisions, notebookCurrent } from '../db/schema'
import { tryValidateDoc } from '../../src/notebook/doc/validate'

const notebook = new Hono()

async function requireAdminStub(c: { req: { header: (k: string) => string | undefined } }): Promise<boolean> {
  const token = c.req.header('x-admin-token')
  return Boolean(token) && token === process.env.ADMIN_DEV_TOKEN
}

async function getCurrent(): Promise<{ revisionId: number; doc: unknown } | null> {
  const rows = await db
    .select({ revisionId: notebookCurrent.revisionId, doc: notebookRevisions.doc })
    .from(notebookCurrent)
    .innerJoin(notebookRevisions, eq(notebookCurrent.revisionId, notebookRevisions.id))
    .where(eq(notebookCurrent.id, 1))
    .limit(1)
  return rows[0] ?? null
}

notebook.get('/notebook', async (c) => {
  const current = await getCurrent()
  if (!current) return c.json({ errors: ['no notebook doc seeded'] }, 500)

  const etag = String(current.revisionId)
  if (c.req.header('if-none-match') === etag) return c.body(null, 304)

  c.header('ETag', etag)
  return c.json({ doc: current.doc, revisionId: current.revisionId })
})

notebook.put('/notebook', async (c) => {
  if (!(await requireAdminStub(c))) return c.json({ errors: ['unauthorized'] }, 401)

  const body = await c.req.json().catch(() => null) as { doc?: unknown; baseRevisionId?: unknown; note?: unknown } | null
  if (!body || typeof body.baseRevisionId !== 'number') {
    return c.json({ errors: ['body must be { doc, baseRevisionId, note? }'] }, 400)
  }

  const result = tryValidateDoc(body.doc)
  if (!result.ok) return c.json({ errors: result.errors }, 400)

  const current = await getCurrent()
  if (!current) return c.json({ errors: ['no notebook doc seeded'] }, 500)
  if (current.revisionId !== body.baseRevisionId) {
    return c.json({ currentRevisionId: current.revisionId }, 409)
  }

  const note = typeof body.note === 'string' ? body.note : null

  const revisionId = await db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(notebookRevisions)
      .values({ doc: result.doc, note, createdBy: 'admin' })
      .returning({ id: notebookRevisions.id })
    await tx.update(notebookCurrent).set({ revisionId: revision.id }).where(eq(notebookCurrent.id, 1))
    return revision.id
  })

  return c.json({ revisionId })
})

notebook.get('/revisions', async (c) => {
  if (!(await requireAdminStub(c))) return c.json({ errors: ['unauthorized'] }, 401)

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

notebook.post('/revisions/:id/restore', async (c) => {
  if (!(await requireAdminStub(c))) return c.json({ errors: ['unauthorized'] }, 401)

  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ errors: ['invalid revision id'] }, 400)

  const rows = await db.select({ doc: notebookRevisions.doc }).from(notebookRevisions).where(eq(notebookRevisions.id, id)).limit(1)
  const old = rows[0]
  if (!old) return c.json({ errors: [`revision ${id} not found`] }, 404)

  const revisionId = await db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(notebookRevisions)
      .values({ doc: old.doc, note: `restore of #${id}`, createdBy: 'admin' })
      .returning({ id: notebookRevisions.id })
    await tx.update(notebookCurrent).set({ revisionId: revision.id }).where(eq(notebookCurrent.id, 1))
    return revision.id
  })

  return c.json({ revisionId })
})

export default notebook
