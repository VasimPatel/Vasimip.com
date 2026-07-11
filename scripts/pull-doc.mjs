// Pull the live notebook doc from a running server into the repo's baked file.
// Usage: BASE_URL=https://your.app node scripts/pull-doc.mjs   (or `bun run pull-doc`)
//        node scripts/pull-doc.mjs http://localhost:8794
// Fetches BASE_URL/api/notebook and writes src/notebook/notebook.json (pretty
// 2-space + trailing newline) so prod content can seed the local dev file / the
// baked fallback. Refuses to run if notebook.json already has uncommitted changes
// (same guard as admin-check) so a pull can't silently clobber local edits.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const BASE = (process.env.BASE_URL || process.argv[2] || 'http://localhost:8787').replace(/\/$/, '')
const DOC = fileURLToPath(new URL('../src/notebook/notebook.json', import.meta.url))

const dirty = execSync('git status --porcelain -- src/notebook/notebook.json', { encoding: 'utf8' }).trim()
if (dirty && !process.env.PULL_DOC_ALLOW_DIRTY) {
  console.error('FAIL notebook.json has uncommitted changes — commit or stash first (or set PULL_DOC_ALLOW_DIRTY=1).')
  process.exit(1)
}

const res = await fetch(BASE + '/api/notebook')
if (!res.ok) { console.error(`FAIL GET ${BASE}/api/notebook → ${res.status}`); process.exit(1) }
const body = await res.json()
const doc = body.doc ?? body

const before = await readFile(DOC, 'utf8').catch(() => '')
const next = JSON.stringify(doc, null, 2) + '\n'
await writeFile(DOC, next, 'utf8')

if (next === before) console.log(`pull-doc: notebook.json already matches the server (revision ${body.revisionId ?? '?'})`)
else console.log(`pull-doc: wrote src/notebook/notebook.json from ${BASE} (revision ${body.revisionId ?? '?'})`)
