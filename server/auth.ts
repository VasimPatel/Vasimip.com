// ─────────────────────────────────────────────────────────────────────────────
// Better Auth — passwordless owner-only login for the notebook admin.
//
// Two ways in: a WebAuthn passkey (primary) and an email magic-link (fallback).
// No passwords. Sessions are httpOnly SameSite=Lax cookies on the single origin,
// so there is no CORS surface to defend.
//
// OWNER-ONLY: account creation is gated to `OWNER_EMAIL` in a database hook, so
// EVERY signup path (magic-link first login, passkey) is covered. A magic-link
// request for any other address returns the SAME success shape and simply never
// sends/creates anything — no email-enumeration oracle.
// ─────────────────────────────────────────────────────────────────────────────
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { APIError } from 'better-auth/api'
import { db } from './db'
import * as authSchema from './db/auth-schema'

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787'
const OWNER_EMAIL = process.env.OWNER_EMAIL?.toLowerCase() ?? ''

const isOwner = (email: string): boolean => email.toLowerCase() === OWNER_EMAIL

// Deliver the magic link. With RESEND_API_KEY set we POST the Resend REST API
// directly (no SDK dependency); without a key (local dev) we LOG the link to the
// server console so login works offline without any mail provider.
async function sendMagicLink({ email, url }: { email: string; url: string }): Promise<void> {
  // Enumeration safety: only owner requests ever produce a real link. Everyone
  // else gets the same silent success upstream.
  if (!isOwner(email)) return

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log('\n──────────────────────────────────────────────')
    console.log('[dev magic-link] no RESEND_API_KEY — login link below:')
    console.log(`[dev magic-link] ${url}`)
    console.log('──────────────────────────────────────────────\n')
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Notebook <onboarding@resend.dev>',
      to: email,
      subject: 'Your notebook login link',
      html: `<p>Tap to sign in to your notebook:</p><p><a href="${url}">${url}</a></p><p>This link expires shortly. If you didn't request it, ignore this email.</p>`,
    }),
  })
  if (!res.ok) console.error('[magic-link] Resend send failed:', res.status, await res.text().catch(() => ''))
}

export const auth = betterAuth({
  baseURL: BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  // Passwordless: email/password sign-in is off entirely.
  emailAndPassword: { enabled: false },
  session: {
    // Same-origin cookie session; better-auth defaults are httpOnly + SameSite=Lax.
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  databaseHooks: {
    user: {
      create: {
        // The single owner-only choke point: no non-owner user is ever created,
        // whatever the flow (magic-link, passkey registration).
        before: async (user) => {
          if (!isOwner(user.email)) {
            throw new APIError('FORBIDDEN', { message: 'Sign-up is not open.' })
          }
        },
      },
    },
  },
  plugins: [passkey({ rpName: 'Notebook' }), magicLink({ sendMagicLink })],
})
