// ─────────────────────────────────────────────────────────────────────────────
// The admin's client for the invites + submissions API (server/routes/invites.ts).
// In DEV file mode (vite, no Bun server) these endpoints don't exist — the proxy
// to :8787 fails or returns HTML — so every call funnels through `json()` which
// returns `null` on any non-JSON / network failure; the Inbox reads that as
// "no real server" and shows a graceful hint instead of the manager.
// ─────────────────────────────────────────────────────────────────────────────

export type InviteStatus = 'active' | 'expired' | 'revoked' | 'exhausted'

export interface InviteRow {
  id: number
  token: string
  label: string | null
  expiresAt: string | null
  maxUses: number | null
  useCount: number
  revokedAt: string | null
  createdAt: string
  submissionCount: number
  pendingCount: number
  status: InviteStatus
  url: string
}

export interface SubmissionRow {
  id: number
  inviteId: number
  inviteLabel: string | null
  authorName: string | null
  /** The stored submission payload — a legacy bare content panel OR the v2
   *  guestbook envelope. Normalize with `normalizeSubmission` before use. */
  panel: unknown
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string | null
}

/** GET helper that yields `null` on any failure (network, non-2xx, non-JSON) so
 *  the dev file-mode probe degrades gracefully rather than throwing. */
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' })
    if (!res.ok) return null
    if (!res.headers.get('content-type')?.includes('application/json')) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function listInvites(): Promise<InviteRow[] | null> {
  return getJson<InviteRow[]>('/api/invites')
}

export function listSubmissions(status?: 'pending' | 'approved' | 'rejected'): Promise<SubmissionRow[] | null> {
  return getJson<SubmissionRow[]>('/api/submissions' + (status ? '?status=' + status : ''))
}

export async function createInvite(input: { label?: string; expiresInDays?: number; maxUses?: number }): Promise<{ id: number; url: string } | null> {
  try {
    const res = await fetch('/api/invites', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    return (await res.json()) as { id: number; url: string }
  } catch {
    return null
  }
}

async function post(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin' })
    return res.ok
  } catch { return false }
}

async function del(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' })
    return res.ok
  } catch { return false }
}

export const revokeInvite = (id: number) => del('/api/invites/' + id)
export const approveSubmission = (id: number) => post('/api/submissions/' + id + '/approve')
export const rejectSubmission = (id: number) => post('/api/submissions/' + id + '/reject')
