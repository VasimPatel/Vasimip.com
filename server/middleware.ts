// ─────────────────────────────────────────────────────────────────────────────
// requireOwner — the real auth boundary for every mutating notebook route.
// Reads the Better Auth session from the request cookies; 401 with no session,
// 403 if the session's user isn't the owner. Replaces the old x-admin-token stub.
// ─────────────────────────────────────────────────────────────────────────────
import type { Context, Next } from 'hono'
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
