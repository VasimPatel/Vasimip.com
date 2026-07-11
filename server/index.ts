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
import { existsSync } from 'node:fs'
import { db } from './db'
import { seed } from './db/seed'
import notebook from './routes/notebook'

const PORT = Number(process.env.PORT) || 8787
const DIST_DIR = './dist'

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
app.route('/api', notebook)

// Static assets, then an SPA fallback for anything else that isn't /api/* and
// isn't a real file on disk (so client routes like /admin resolve to index.html).
app.use('/*', serveStatic({ root: DIST_DIR }))
app.get('*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) return next()
  return serveStatic({ path: `${DIST_DIR}/index.html` })(c, next)
})

async function boot(): Promise<void> {
  if (!existsSync('./drizzle')) {
    console.warn('boot: no ./drizzle migrations folder found, skipping migrate')
  } else {
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('boot: migrations applied')
  }
  await seed()

  Bun.serve({ port: PORT, fetch: app.fetch })
  console.log(`boot: listening on :${PORT}`)
}

await boot()
