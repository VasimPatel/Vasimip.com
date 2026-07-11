// ─────────────────────────────────────────────────────────────────────────────
// Bun/Hono API + static server. Serves the built SPA (dist/) with an SPA
// fallback (so client routes like /admin resolve), mounts /api/* routes, and
// runs Drizzle migrations + the idempotent seed before listening — the
// simplest boot story for a single Railway service (see docs/plan build order,
// step 1 & 5).
// ─────────────────────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { secureHeaders } from 'hono/secure-headers'
import { bodyLimit } from 'hono/body-limit'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { db } from './db'
import { seed } from './db/seed'
import { auth } from './auth'
import notebook from './routes/notebook'
import invites from './routes/invites'

const PORT = Number(process.env.PORT) || 8787
const DIST_DIR = './dist'
// A fixed key so concurrent replicas serialize migrate+seed on one advisory lock.
const BOOT_LOCK_KEY = 428_517_001

// Fail fast in production if the security-critical env is missing or weak. Dev
// (NODE_ENV !== 'production') keeps the lenient localhost defaults elsewhere.
function requireProdEnv(): void {
  if (process.env.NODE_ENV !== 'production') return
  const problems: string[] = []
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) problems.push('BETTER_AUTH_SECRET must be set and at least 32 characters (openssl rand -base64 32)')
  if (!process.env.OWNER_EMAIL) problems.push('OWNER_EMAIL must be set (the single owner login)')
  const base = process.env.BASE_URL
  if (!base || !base.startsWith('https://')) problems.push('BASE_URL must be set and start with https://')
  if (problems.length > 0) {
    console.error('FATAL: production environment is misconfigured — refusing to start:')
    for (const p of problems) console.error('  · ' + p)
    process.exit(1)
  }
}

const app = new Hono()

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  }),
)

app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 })) // 1 MB

app.get('/api/health', (c) => c.json({ ok: true }))
// Better Auth owns everything under /api/auth/* (passkey + magic-link + session).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
app.route('/api', notebook)
app.route('/api', invites)

// Static assets, then an SPA fallback for anything else that isn't /api/* and
// isn't a real file on disk (so client routes like /admin resolve to index.html).
app.use('/*', serveStatic({ root: DIST_DIR }))
app.get('*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) return next()
  return serveStatic({ path: `${DIST_DIR}/index.html` })(c, next)
})

async function boot(): Promise<void> {
  requireProdEnv()

  // Serialize DDL: a session-level advisory lock so concurrent replicas can't
  // both run migrate+seed at once (double DDL). Held across both, released after.
  await db.execute(sql`SELECT pg_advisory_lock(${BOOT_LOCK_KEY})`)
  try {
    if (!existsSync('./drizzle')) {
      console.warn('boot: no ./drizzle migrations folder found, skipping migrate')
    } else {
      await migrate(db, { migrationsFolder: './drizzle' })
      console.log('boot: migrations applied')
    }
    await seed()
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${BOOT_LOCK_KEY})`)
  }

  Bun.serve({ port: PORT, fetch: app.fetch })
  console.log(`boot: listening on :${PORT}`)
}

await boot()
