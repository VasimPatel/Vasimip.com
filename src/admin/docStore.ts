// ─────────────────────────────────────────────────────────────────────────────
// The one adapter the admin AND the live site talk to: `/api/notebook` (GET/PUT)
// plus the revisions endpoints. Same contract in prod (Bun/Hono server) and in
// dev (the Vite middleware in plugins/notebook-admin.ts is a file-backed mock of
// these exact routes with a fake monotonic revisionId) — so this code is
// identical in both worlds. Cookies ride along via `credentials: 'same-origin'`.
// ─────────────────────────────────────────────────────────────────────────────
import type { NotebookDoc } from '../notebook/doc/validate'

export type LoadResult = { doc: NotebookDoc; revisionId: number }

export type SaveResult =
  | { ok: true; revisionId: number }
  | { conflict: true; currentRevisionId: number }
  | { errors: string[] }

export type Revision = { id: number; note: string | null; createdBy: string | null; createdAt: string }

export type RestoreResult =
  | { ok: true; revisionId: number }
  | { conflict: true; currentRevisionId: number }
  | { error: string }

export async function loadDoc(signal?: AbortSignal): Promise<LoadResult> {
  // `no-store`: the notebook is ETag'd, and a conditional 304 would hand us an
  // empty body — always fetch the full doc fresh.
  const res = await fetch('/api/notebook', { credentials: 'same-origin', cache: 'no-store', signal })
  if (!res.ok) throw new Error('GET /api/notebook → ' + res.status)
  const body = await res.json()
  return { doc: body.doc as NotebookDoc, revisionId: body.revisionId as number }
}

export async function saveDoc(doc: NotebookDoc, baseRevisionId: number, note?: string): Promise<SaveResult> {
  let res: Response
  try {
    res = await fetch('/api/notebook', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc, baseRevisionId, note: note && note.length ? note : undefined }),
    })
  } catch {
    return { errors: ['could not reach the server — your scribbles are safe, try again'] }
  }
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    return { conflict: true, currentRevisionId: body.currentRevisionId as number }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ errors: ['save failed (' + res.status + ')'] }))
    return { errors: (body.errors as string[]) ?? ['save failed (' + res.status + ')'] }
  }
  const body = await res.json().catch(() => ({}))
  return { ok: true, revisionId: (body as { revisionId?: number }).revisionId as number }
}

// null → the endpoint isn't there (dev file mode 404s /api/revisions, or the
// network failed): the caller hides the history menu.
export async function listRevisions(): Promise<Revision[] | null> {
  try {
    const res = await fetch('/api/revisions', { credentials: 'same-origin' })
    if (!res.ok) return null
    return (await res.json()) as Revision[]
  } catch {
    return null
  }
}

// Restore an old revision as a new one. Passes the admin's current baseRevisionId
// so the server can CAS the pointer (409 if someone else saved in the meantime).
export async function restoreRevision(id: number, baseRevisionId?: number): Promise<RestoreResult> {
  let res: Response
  try {
    res = await fetch('/api/revisions/' + id + '/restore', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseRevisionId != null ? { baseRevisionId } : {}),
    })
  } catch {
    return { error: 'could not reach the server — try again' }
  }
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    return { conflict: true, currentRevisionId: (body as { currentRevisionId?: number }).currentRevisionId as number }
  }
  if (!res.ok) return { error: 'restore failed (' + res.status + ')' }
  const body = await res.json().catch(() => ({}))
  return { ok: true, revisionId: (body as { revisionId?: number }).revisionId as number }
}
