// ─────────────────────────────────────────────────────────────────────────────
// engine-check — the REPEATABLE Phase 8 server gate (P8 review fix 5).
//
// Boots the REAL app (`bun server/index.ts` as a subprocess — full boot:
// migrate + seed + Better Auth; a stubbed session would bypass the very
// boundary this checks), authenticates via the dev magic-link (the URL is
// logged to the subprocess stdout when RESEND_API_KEY is unset), then:
//
//   1. THE GATE — POST /api/simulate with the Wall Test scenario must return a
//      hash + trace length BYTE-IDENTICAL to a local simulate() in this same
//      process (both Bun — ENGINE_V2 §3 rule 1).
//   2. Auth boundary — unauthenticated /api/validate → 401.
//   3. v2 notebook saves are rejected (422), the pointer does not move, and the
//      public GET keeps serving the v1 doc (P8 review blocker 1).
//   4. A v1 doc with a stray `schemaVersion: 2` still saves as v1 (v1-first
//      dispatch — P8 review fix 3).
//   5. An over-cap simulate payload → 400 fast (complexity caps — blocker 2).
//   6. maxTicks over the server clamp → ticks ≤ 20 000.
//
// NOT part of CI (CI stays DB-less). Requirements (see docs/engine-v2/headless-api.md):
//   · dev Postgres up (docker `dash-pg`: postgres:16 @ localhost:5433, db `dash`)
//   · run from the repo root:  bun server/e2e/engine-check.ts
//   Env (all defaulted for the dev container, overridable):
//   DATABASE_URL, OWNER_EMAIL, BETTER_AUTH_SECRET, BASE_URL, ENGINE_CHECK_PORT
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { simulate, type SimulateInput, type SimulateResult, type CharacterSpec } from '@dash/headless'

// server/ depends ONLY on @dash/headless (the stable surface) — derive the doc types
// from it rather than importing @dash/schema/@dash/engine directly.
type WorldDocV2 = SimulateInput['world']
type BehaviorDoc = NonNullable<SimulateInput['behaviors']>[number]
type RigTemplate = CharacterSpec['rig']
type CharacterDoc = CharacterSpec['character']
type Pose = NonNullable<CharacterSpec['poses']>[string]
type Clip = NonNullable<CharacterSpec['clips']>[string]

/** The four edges of a panel box (inlined from @dash/engine's panelEdges — same order). */
function panelEdges(b: { x: number; y: number; w: number; h: number }): { x1: number; y1: number; x2: number; y2: number }[] {
  return [
    { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y }, // top
    { x1: b.x + b.w, y1: b.y, x2: b.x + b.w, y2: b.y + b.h }, // right
    { x1: b.x + b.w, y1: b.y + b.h, x2: b.x, y2: b.y + b.h }, // bottom
    { x1: b.x, y1: b.y + b.h, x2: b.x, y2: b.y }, // left
  ]
}

const PORT = Number(process.env.ENGINE_CHECK_PORT) || 8791
const BASE = `http://localhost:${PORT}`
const OWNER = process.env.OWNER_EMAIL || 'owner@dash.test'
const ENV = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:dev@localhost:5433/dash',
  OWNER_EMAIL: OWNER,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'dev-secret-at-least-32-chars-long-xxxx',
  BASE_URL: BASE,
  PORT: String(PORT),
  RESEND_API_KEY: '', // force the dev magic-link path (URL logged to stdout)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
let passes = 0
let fails = 0
const ok = (m: string): void => {
  passes++
  console.log('PASS ' + m)
}
const bad = (m: string): void => {
  fails++
  console.log('FAIL ' + m)
}
const eq = (m: string, actual: unknown, expected: unknown): void =>
  actual === expected ? ok(`${m} (${String(actual)})`) : bad(`${m}: expected ${String(expected)}, got ${String(actual)}`)

// ── the Wall Test fixture (source of truth: packages/headless/test/acceptance.walltest.test.ts) ──
const CONTENT = new URL('../../content/engine/', import.meta.url)
const rj = <T>(rel: string): T => JSON.parse(readFileSync(new URL(rel, CONTENT), 'utf8')) as T

const rig = rj<RigTemplate>('rig.dash.json')
const character = rj<CharacterDoc>('character.dash.json')
const poses: Record<string, Pose> = {
  stand: rj('poses/stand.json'),
  'squash-land': rj('poses/squash-land.json'),
  'jump-tuck': rj('poses/jump-tuck.json'),
  cheer: rj('poses/cheer.json'),
  think: rj('poses/think.json'),
}
const clips: Record<string, Clip> = {
  jump: rj('clips/jump.json'),
  'idle-shuffle': rj('clips/idle-shuffle.json'),
  'walk-cycle': rj('clips/walk-cycle.json'),
}

const BOX = { x: 100, y: 100, w: 200, h: 200 }
const GOAL = { x: BOX.x + BOX.w + 120, y: BOX.y + BOX.h / 2 }
const cellWorld = (): WorldDocV2 => ({
  schemaVersion: 2,
  seed: 1,
  entities: [
    {
      id: 'cell',
      components: {
        transform: { x: BOX.x, y: BOX.y },
        surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } },
        collidable: { shape: 'segments', segments: panelEdges(BOX) },
      },
    },
    { id: 'goal', components: { transform: { x: GOAL.x, y: GOAL.y } } },
  ],
})
const WALL_BEHAVIOR: BehaviorDoc = {
  schemaVersion: 2,
  id: 'wall-run',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
  reactions: {
    onBlocked: [
      { verb: 'strikePose', ref: 'squash-land', holdMs: 250 },
      { verb: 'say', text: 'ow!' },
      { verb: 'impulse', target: 'self', vec: [-140, -40] },
    ],
  },
}
const wallInput = (): SimulateInput => ({
  world: cellWorld(),
  characters: [
    {
      character,
      rig,
      poses,
      clips,
      names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
      restPose: poses.stand,
      initialTransform: { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2, rot: 0, facing: 1 },
      initialFeetY: BOX.y + BOX.h / 2,
    },
  ],
  behaviors: [WALL_BEHAVIOR],
  run: { characterId: character.id, behaviorId: 'wall-run' },
  seed: 7,
})

// ── server subprocess ─────────────────────────────────────────────────────────────
let serverOut = ''
const server = Bun.spawn(['bun', 'server/index.ts'], {
  env: ENV,
  stdout: 'pipe',
  stderr: 'pipe',
})
async function pump(stream: ReadableStream<Uint8Array>): Promise<void> {
  // reader loop (not for-await): the server tsconfig's DOM lib types ReadableStream
  // without an async iterator; Bun implements both, tsc only accepts this form.
  const dec = new TextDecoder()
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    if (value) serverOut += dec.decode(value)
  }
}
void pump(server.stdout)
void pump(server.stderr)

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await sleep(100)
  }
  throw new Error(`server never became healthy on :${PORT}; last output:\n${serverOut.slice(-2000)}`)
}

async function login(): Promise<string> {
  const before = serverOut.length
  const r = await fetch(`${BASE}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER, callbackURL: '/' }),
  })
  if (!r.ok) throw new Error(`magic-link request failed: ${r.status} ${await r.text()}`)
  let url: string | null = null
  for (let i = 0; i < 50 && !url; i++) {
    await sleep(100)
    const m = serverOut.slice(before).match(/\[dev magic-link\] (http:\/\/\S+)/)
    if (m) url = m[1]
  }
  if (!url) throw new Error('magic-link URL never appeared in server output')
  const v = await fetch(url, { redirect: 'manual' })
  const setCookie = v.headers.get('set-cookie')
  if (!setCookie) throw new Error(`magic-link verify set no cookie (status ${v.status})`)
  return setCookie
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.includes('='))
    .join('; ')
}

const J = (cookie: string | null, body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body),
})

async function main(): Promise<void> {
  await waitForHealth()
  ok('server booted (migrate + seed + listen)')

  // 2. auth boundary
  const un = await fetch(`${BASE}/api/validate`, J(null, { doc: cellWorld() }))
  eq('unauthenticated POST /api/validate → 401', un.status, 401)

  const cookie = await login()
  ok('dev magic-link login → session cookie')

  // 1. THE GATE — local vs server wall-test simulate
  const local: SimulateResult = simulate(wallInput())
  console.log(`LOCAL  wall-test: outcome=${local.outcome} ticks=${local.ticks} traceLen=${local.trace.length} hash=${local.hash}`)
  const sg = await fetch(`${BASE}/api/simulate`, J(cookie, wallInput()))
  const sgj = (await sg.json()) as SimulateResult
  eq('server /api/simulate status', sg.status, 200)
  console.log(`SERVER wall-test: outcome=${sgj.outcome} ticks=${sgj.ticks} traceLen=${sgj.trace?.length} hash=${sgj.hash}`)
  eq('THE GATE: server hash === local hash', sgj.hash, local.hash)
  eq('THE GATE: server trace length === local', sgj.trace?.length, local.trace.length)
  eq('server outcome', sgj.outcome, local.outcome)

  // 3. v2 notebook saves rejected; pointer + public GET unchanged (blocker 1)
  const cur = (await (await fetch(`${BASE}/api/notebook`)).json()) as { revisionId: number; doc: unknown }
  // PRECONDITION: the current doc must be v1 (the live site's contract). If a past
  // run/tool polluted the dev DB with a v2 current, fail loudly with the remedy
  // rather than producing confusing downstream failures.
  if ((cur.doc as { version?: unknown } | null)?.version !== 1) {
    throw new Error(
      `precondition failed: notebook_current serves a non-v1 doc (revision ${cur.revisionId}). ` +
        `Repoint it at a v1 revision, e.g.: docker exec dash-pg psql -U postgres -d dash ` +
        `-c "UPDATE notebook_current SET revision_id = <v1-revision-id> WHERE id = 1;"`,
    )
  }
  ok(`precondition: current notebook doc is v1 (revision ${cur.revisionId})`)
  const v2put = await fetch(`${BASE}/api/notebook`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ doc: cellWorld(), baseRevisionId: cur.revisionId, note: 'engine-check v2 (must reject)' }),
  })
  eq('v2 notebook PUT → 422', v2put.status, 422)
  const v2j = (await v2put.json()) as { errors?: string[] }
  ok(`v2 rejection message: ${v2j.errors?.[0]?.slice(0, 60)}…`)
  const after = (await (await fetch(`${BASE}/api/notebook`)).json()) as { revisionId: number; doc: unknown }
  eq('pointer unmoved after v2 rejection', after.revisionId, cur.revisionId)
  eq('public GET still serves the v1 doc byte-identically', JSON.stringify(after.doc), JSON.stringify(cur.doc))

  // 4. v1-first dispatch: a v1 doc with a STRAY schemaVersion:2 still saves as v1 (fix 3)
  const strayDoc = { ...(cur.doc as Record<string, unknown>), schemaVersion: 2 }
  const strayPut = await fetch(`${BASE}/api/notebook`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ doc: strayDoc, baseRevisionId: cur.revisionId, note: 'engine-check v1 + stray schemaVersion' }),
  })
  eq('v1 doc + stray schemaVersion:2 → 200 (validated as v1)', strayPut.status, 200)
  const strayRev = ((await strayPut.json()) as { revisionId: number }).revisionId
  // restore the original v1 doc so the check leaves the DB pointer content unchanged
  const restorePut = await fetch(`${BASE}/api/notebook`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ doc: cur.doc, baseRevisionId: strayRev, note: 'engine-check restore' }),
  })
  eq('restore original v1 doc → 200', restorePut.status, 200)

  // 5. over-cap payload rejects fast (blocker 2)
  const fat = cellWorld()
  for (let i = 0; i < 220; i++) fat.entities.push({ id: `f${i}`, components: { transform: { x: i, y: 0 } } })
  const t0 = performance.now()
  const capResp = await fetch(`${BASE}/api/simulate`, J(cookie, { world: fat }))
  const capMs = performance.now() - t0
  eq('over-cap world → 400', capResp.status, 400)
  const capJ = (await capResp.json()) as { errors?: string[] }
  ok(`cap error (${capMs.toFixed(0)}ms round-trip): ${capJ.errors?.[0]?.slice(0, 70)}`)

  // 6. maxTicks server clamp
  const clamp = await fetch(`${BASE}/api/simulate`, J(cookie, { world: cellWorld(), maxTicks: 999999 }))
  const clampJ = (await clamp.json()) as { ticks: number }
  eq('maxTicks 999999 → clamped to 20000 ticks', clampJ.ticks, 20000)

  console.log(`\n──────── engine-check: ${passes} PASS, ${fails} FAIL ────────`)
  process.exitCode = fails === 0 ? 0 : 1
}

try {
  await main()
} catch (e) {
  console.error('engine-check ERROR:', e)
  process.exitCode = 2
} finally {
  server.kill()
}
