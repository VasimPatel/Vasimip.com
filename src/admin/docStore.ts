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

export async function loadDoc(signal?: AbortSignal): Promise<LoadResult> {
  const res = await fetch('/api/notebook', { credentials: 'same-origin', signal })
  if (!res.ok) throw new Error('GET /api/notebook → ' + res.status)
  const body = await res.json()
  return { doc: body.doc as NotebookDoc, revisionId: body.revisionId as number }
}

export async function saveDoc(doc: NotebookDoc, baseRevisionId: number, note?: string): Promise<SaveResult> {
  const res = await fetch('/api/notebook', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc, baseRevisionId, note: note && note.length ? note : undefined }),
  })
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    return { conflict: true, currentRevisionId: body.currentRevisionId as number }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ errors: ['save failed (' + res.status + ')'] }))
    return { errors: (body.errors as string[]) ?? ['save failed (' + res.status + ')'] }
  }
  const body = await res.json()
  return { ok: true, revisionId: body.revisionId as number }
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

export async function restoreRevision(id: number): Promise<boolean> {
  const res = await fetch('/api/revisions/' + id + '/restore', { method: 'POST', credentials: 'same-origin' })
  return res.ok
}
