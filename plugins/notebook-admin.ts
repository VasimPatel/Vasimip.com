// ─────────────────────────────────────────────────────────────────────────────
// Dev-only Vite middleware backing the /admin WYSIWYG portal. It is a FILE-BACKED
// MOCK of the real Bun/Hono API so the admin's docStore code is byte-identical in
// dev and prod. It exposes, on the running dev server:
//   GET  /api/notebook  → { doc, revisionId }   (the current notebook.json)
//   PUT  /api/notebook  → { doc, baseRevisionId, note? } → validate, then:
//                           baseRevisionId mismatch → 409 { currentRevisionId }
//                           invalid doc            → 400 { errors }
//                           ok                     → 200 { revisionId } (+ writes file)
//   GET  /__notebook  → raw notebook.json    (LEGACY — scripts/admin-check.mjs)
//   POST /__notebook  → validate + write, 204 (LEGACY — kept working)
// `revisionId` is a fake in-memory monotonic counter (starts at 1); there's no
// real revision store on disk, but the shape matches the server so 409 conflict
// handling can be exercised in dev too. There is deliberately NO /api/revisions
// here → the admin's history menu 404s its probe and hides itself (dev file mode).
//
// PRECEDENCE: registering handlers directly via `server.middlewares.use(...)` in
// `configureServer` (rather than returning a post-hook) runs them BEFORE Vite's
// internal middlewares — including the `/api` → :8787 dev proxy (vite.config.ts).
// So /api/notebook is intercepted HERE and stays file-backed even when the Bun
// server is also running; that's intended (dev edits the local file, not the DB).
//
// `apply: 'serve'` (plus `configureServer` only running under `vite dev`) means
// this NEVER touches `vite build` output — production stays a pure static deploy.
// ─────────────────────────────────────────────────────────────────────────────
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tryValidateDoc } from '../src/notebook/doc/validate'

const DOC_PATH = fileURLToPath(new URL('../src/notebook/notebook.json', import.meta.url))
const MAX_BODY = 2 * 1024 * 1024 // 2 MB

type Res = ServerResponse | { statusCode: number; setHeader: (k: string, v: string) => void; end: (s?: string) => void }

function sendJson(res: Res, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Read a size-capped request body, then hand the text to `cb`. On overflow it
// answers 413 itself and never calls back.
function readBody(req: IncomingMessage, res: Res, cb: (text: string) => void): void {
  const chunks: Buffer[] = []
  let size = 0
  let aborted = false
  req.on('data', (c: Buffer) => {
    if (aborted) return
    size += c.length
    if (size > MAX_BODY) {
      aborted = true
      sendJson(res, 413, { errors: ['request body exceeds 2 MB'] })
      req.destroy()
      return
    }
    chunks.push(c)
  })
  req.on('end', () => { if (!aborted) cb(Buffer.concat(chunks).toString('utf8')) })
}

export function notebookAdmin(): Plugin {
  // Fake monotonic revision counter — the live doc's revisionId. Bumped on every
  // successful write (via either endpoint) so a stale baseRevisionId 409s.
  let revisionId = 1

  return {
    name: 'notebook-admin',
    apply: 'serve',
    configureServer(server) {
      // ── /api/notebook — the same contract the prod server serves ──────────
      server.middlewares.use('/api/notebook', (req, res, next) => {
        if (req.method === 'GET') {
          readFile(DOC_PATH, 'utf8')
            .then((txt) => {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ doc: JSON.parse(txt), revisionId }))
            })
            .catch((err) => sendJson(res, 500, { errors: [String(err)] }))
          return
        }
        if (req.method === 'PUT') {
          readBody(req, res, (text) => {
            let body: { doc?: unknown; baseRevisionId?: unknown; note?: unknown } | null
            try { body = JSON.parse(text) } catch (e) { sendJson(res, 400, { errors: ['invalid JSON: ' + (e as Error).message] }); return }
            if (!body || typeof body.baseRevisionId !== 'number') {
              sendJson(res, 400, { errors: ['body must be { doc, baseRevisionId, note? }'] })
              return
            }
            const result = tryValidateDoc(body.doc)
            if (!result.ok) { sendJson(res, 400, { errors: result.errors }); return }
            if (body.baseRevisionId !== revisionId) { sendJson(res, 409, { currentRevisionId: revisionId }); return }
            writeFile(DOC_PATH, JSON.stringify(result.doc, null, 2) + '\n', 'utf8')
              .then(() => { revisionId += 1; sendJson(res, 200, { revisionId }) })
              .catch((err) => sendJson(res, 500, { errors: [String(err)] }))
          })
          return
        }
        next()
      })

      // ── /__notebook — LEGACY (scripts/admin-check.mjs still uses GET/POST) ──
      server.middlewares.use('/__notebook', (req, res, next) => {
        if (req.method === 'GET') {
          readFile(DOC_PATH, 'utf8')
            .then((txt) => { res.setHeader('Content-Type', 'application/json'); res.end(txt) })
            .catch((err) => sendJson(res, 500, { errors: [String(err)] }))
          return
        }
        if (req.method === 'POST') {
          readBody(req, res, (text) => {
            let parsed: unknown
            try { parsed = JSON.parse(text) } catch (e) { sendJson(res, 400, { errors: ['invalid JSON: ' + (e as Error).message] }); return }
            const result = tryValidateDoc(parsed)
            if (!result.ok) { sendJson(res, 400, { errors: result.errors }); return }
            writeFile(DOC_PATH, JSON.stringify(result.doc, null, 2) + '\n', 'utf8')
              .then(() => { revisionId += 1; res.statusCode = 204; res.end() })
              .catch((err) => sendJson(res, 500, { errors: [String(err)] }))
          })
          return
        }
        next()
      })
    },
  }
}
