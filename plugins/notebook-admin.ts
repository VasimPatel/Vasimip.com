// ─────────────────────────────────────────────────────────────────────────────
// Dev-only Vite middleware backing the /admin WYSIWYG portal. It exposes the
// authored document over two endpoints on the running dev server:
//   GET  /__notebook  → the current src/notebook/notebook.json (application/json)
//   POST /__notebook  → validate the posted doc; on success pretty-print it back
//                       to notebook.json (clean diffs, HMR reloads the site).
// `apply: 'serve'` (plus `configureServer` only running under `vite dev`) means
// this NEVER touches `vite build` output — production stays a pure static deploy.
// ─────────────────────────────────────────────────────────────────────────────
import type { Plugin } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tryValidateDoc } from '../src/notebook/doc/validate'

const DOC_PATH = fileURLToPath(new URL('../src/notebook/notebook.json', import.meta.url))
const MAX_BODY = 2 * 1024 * 1024 // 2 MB

function sendJson(res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s?: string) => void }, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function notebookAdmin(): Plugin {
  return {
    name: 'notebook-admin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__notebook', (req, res, next) => {
        if (req.method === 'GET') {
          readFile(DOC_PATH, 'utf8')
            .then((txt) => { res.setHeader('Content-Type', 'application/json'); res.end(txt) })
            .catch((err) => sendJson(res, 500, { errors: [String(err)] }))
          return
        }
        if (req.method === 'POST') {
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
          req.on('end', () => {
            if (aborted) return
            let parsed: unknown
            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            } catch (e) {
              sendJson(res, 400, { errors: ['invalid JSON: ' + (e as Error).message] })
              return
            }
            const result = tryValidateDoc(parsed)
            if (!result.ok) { sendJson(res, 400, { errors: result.errors }); return }
            writeFile(DOC_PATH, JSON.stringify(result.doc, null, 2) + '\n', 'utf8')
              .then(() => { res.statusCode = 204; res.end() })
              .catch((err) => sendJson(res, 500, { errors: [String(err)] }))
          })
          return
        }
        next()
      })
    },
  }
}
