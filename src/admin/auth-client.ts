// Better Auth browser client for the admin. Same-origin: baseURL is the current
// page's origin, so cookies just work. Passkey + magic-link plugins mirror the
// server (server/auth.ts).
import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export const authClient = createAuthClient({
  plugins: [passkeyClient(), magicLinkClient()],
})

export const { useSession, signIn, signOut, passkey } = authClient
