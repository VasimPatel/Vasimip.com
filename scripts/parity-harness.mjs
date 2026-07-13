// Parity laboratory (Stage 1) — deterministic dual-route comparison harness.
//
// Runs named scenarios on BOTH routes (engine `/` and legacy `/legacy`) with the
// SAME forced choices (window.__dashReview installed pre-boot), captures a Dash
// close-up strip + periodic full-scene frames with real timestamps, and collects
// one normalized timeline per run (legacy state transitions + engine event trace
// + the pick/chance choice trail). Console/page errors are fatal.
//
// Usage:
//   node scripts/parity-harness.mjs <outDir> [baseURL] [scenario ...]
//   node scripts/parity-harness.mjs <outDir> [baseURL] --self-check   # determinism: run twice, compare
//   node scripts/parity-harness.mjs <outDir> [baseURL] --negative-control
//
// Output: <outDir>/<scenario>/<route>/dash-NNN.png, full-NNN.png,
//         <outDir>/<scenario>/timeline.json, <outDir>/summary.json
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = process.argv[2]
if (!OUT) {
  console.error('usage: node scripts/parity-harness.mjs <outDir> [baseURL] [scenario ...| --self-check | --negative-control]')
  process.exit(2)
}
const BASE = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://localhost:5178'
const rest = process.argv.slice(process.argv[3]?.startsWith('http') ? 4 : 3)
const SELF_CHECK = rest.includes('--self-check')
const NEGATIVE = rest.includes('--negative-control')
const ONLY = rest.filter((a) => !a.startsWith('--'))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── scenarios ────────────────────────────────────────────────────────────────
// force: identical on both routes. drive: how to trigger the performance.
// captureMs / stepMs: strip duration and cadence. page: 1-based site page.
const SCENARIOS = {
  idle: {
    page: 2, captureMs: 9000, stepMs: 600,
    force: { 'fidget.delayMs': 2500, 'fidget.kind': 'chat', 'fidget.line': 1, 'flourish.roll': false },
    drive: async () => {}, // just watch the fidget window
  },
  walk: {
    page: 2, captureMs: 5000, stepMs: 150,
    force: { 'walk.trip': false, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('walk')),
  },
  'walk-trip': {
    page: 2, captureMs: 5500, stepMs: 150,
    force: { 'walk.trip': true, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('walk')),
  },
  hop: {
    page: 2, captureMs: 4000, stepMs: 120,
    force: { 'hop.hang': false, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('hop')),
  },
  roll: {
    page: 2, captureMs: 4000, stepMs: 120,
    force: { 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('roll')),
  },
  vault: {
    page: 2, captureMs: 5000, stepMs: 120,
    force: { 'vault.peek': false, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('vault')),
  },
  rope: {
    page: 2, captureMs: 6500, stepMs: 150,
    force: { 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('rope')),
  },
  swing: {
    page: 2, captureMs: 5000, stepMs: 120,
    force: { 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('swing')),
  },
  smash: {
    page: 2, captureMs: 6000, stepMs: 150,
    force: { 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.evaluate(() => window.__notebookRunBuiltin('smash')),
  },
  'backnav-bomb': {
    page: 3, captureMs: 6000, stepMs: 150,
    force: { 'backnav.bomb': true, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.keyboard.press('ArrowLeft'),
  },
  'backnav-poof': {
    page: 3, captureMs: 4000, stepMs: 150,
    force: { 'backnav.bomb': false, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => p.keyboard.press('ArrowLeft'),
  },
  poke: {
    page: 2, captureMs: 3000, stepMs: 120,
    force: { 'poke.arc': 'spin', 'poke.line': 0, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => {
      const at = await dashCenter(p)
      if (at && onViewport(at)) {
        await p.mouse.move(at.x, at.y)
        await p.mouse.down()
        await p.mouse.up()
      } else {
        // legacy headless camera can park Dash off-viewport (pre-existing quirk;
        // smoke has the same fallback): synthetic press sequence on the element.
        await p.evaluate(() => {
          const el = document.querySelector('[data-dash-poke]') ||
            document.querySelector('[data-dash-actor]')
          for (const type of ['mousedown', 'mouseup', 'click'])
            el?.dispatchEvent(new MouseEvent(type, { bubbles: true }))
        })
      }
    },
  },
  'drag-drop': {
    page: 2, captureMs: 4500, stepMs: 150,
    force: { 'drop.line': 0, 'flourish.roll': false, 'fidget.delayMs': 99999 },
    drive: async (p) => {
      const at = await dashCenter(p)
      if (at && onViewport(at)) {
        await p.mouse.move(at.x, at.y)
        await p.mouse.down()
        for (let i = 1; i <= 10; i++) await p.mouse.move(at.x + i * 12, at.y - i * 8)
        await sleep(400)
        await p.mouse.up()
      } else {
        // synthetic drag: mousedown on the figure, >7px mousemoves on window
        // (both routes listen globally), then mouseup on window.
        await p.evaluate(async () => {
          const el = document.querySelector('[data-dash-poke]') ||
            document.querySelector('[data-dash-actor]')
          if (!el) return
          const r = el.getBoundingClientRect()
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }))
          for (let i = 1; i <= 10; i++) {
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx + i * 12, clientY: cy - i * 8 }))
            await new Promise((res) => setTimeout(res, 30))
          }
          await new Promise((res) => setTimeout(res, 350))
          window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx + 120, clientY: cy - 80 }))
        })
      }
    },
  },
  entrance: {
    page: 2, captureMs: 4500, stepMs: 150,
    force: { 'flourish.roll': false, 'flip.surf': false, 'fidget.delayMs': 99999 },
    // page 2 → 3 forward flip: page-turn + entrance stroll + arrival
    drive: async (p) => p.evaluate(() => window.__notebookGoTo(3)),
  },
}

// ── helpers ──────────────────────────────────────────────────────────────────
const onViewport = (at) => at.x >= 10 && at.x < 1430 && at.y >= 10 && at.y < 890

// NOTE: never select the bare Dash viewBox — Pip (cover sidekick) shares it and
// the cover stays mounted on every page. [data-dash-actor] is the live legacy
// figure; [data-dash-poke]/[data-dash-renderer] are the engine hitbox/figure.
async function dashCenter(p) {
  return p.evaluate(() => {
    const el = document.querySelector('[data-dash-poke]') ||
      document.querySelector('[data-dash-actor]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
}

async function dashClip(p, route) {
  const box = await p.evaluate((m) => {
    const el = m === 'legacy'
      ? document.querySelector('[data-dash-actor]')
      : document.querySelector('[data-dash-renderer]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, route)
  if (!box) return null
  const pad = 110
  return {
    x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
    width: pad * 2, height: pad * 2,
  }
}

/** Run one scenario on one route. Returns { frames, timeline, errors }. */
async function runScenario(browser, route, name, spec, extraForce = {}) {
  const dir = `${OUT}/${name}/${route}`
  mkdirSync(dir, { recursive: true })
  const p = await browser.newPage()
  const errors = []
  p.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location()?.url ?? ''
    if (m.text().startsWith('Failed to load resource') && url.includes('/api/')) return
    errors.push('console.error: ' + m.text())
  })
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  const force = { ...spec.force, ...extraForce }
  await p.evaluateOnNewDocument((f) => {
    window.__dashReview = { seed: 7, force: f, log: [] }
  }, force)

  await p.goto(route === 'legacy' ? `${BASE}/legacy` : `${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 })
  await sleep(500)
  await p.evaluate((pg) => window.__notebookGoTo(pg), spec.page)
  // entrance + arrival settle: wait for a REAL idle (both routes), not a fixed nap —
  // engine arrivals (say holds, persistent poses) outlast legacy's and a fixed wait
  // makes one route's drive land mid-arrival and get busy-gated.
  await sleep(1200)
  for (let w = 0; w < 60; w++) {
    const busy = await p.evaluate(() => window.__notebookBusy?.() ?? false)
    if (!busy) break
    await sleep(250)
  }
  await sleep(300)
  await p.evaluate(() => { window.__dashReview.log.length = 0 }) // timeline starts at drive
  const t0 = Date.now()
  await spec.drive(p)

  const frames = []
  let i = 0
  while (Date.now() - t0 < spec.captureMs) {
    const t = Date.now() - t0
    const clip = await dashClip(p, route)
    const tag = String(i).padStart(3, '0')
    if (clip) await p.screenshot({ path: `${dir}/dash-${tag}.png`, clip })
    if (i % 4 === 0) await p.screenshot({ path: `${dir}/full-${tag}.png` })
    frames.push({ i, t })
    i++
    const next = t0 + (i * spec.stepMs)
    const wait = next - Date.now()
    if (wait > 0) await sleep(wait)
  }

  // settle + collect the normalized timeline
  const busyEnd = Date.now()
  for (let w = 0; w < 80; w++) {
    const busy = await p.evaluate(() => window.__notebookBusy?.() ?? false)
    if (!busy) break
    await sleep(250)
  }
  const timeline = await p.evaluate(() => ({
    log: window.__dashReview.log,
    engineTrace: window.__dashEngineTrace ? window.__dashEngineTrace().slice(-400) : null,
  }))
  await p.close()
  return { frames, timeline, errors, settleWaitMs: Date.now() - busyEnd }
}

/** Reduce a run to comparable checkpoints: ordered (kind) events. */
function checkpoints(run, route) {
  const out = []
  for (const e of run.timeline.log) {
    if (e.kind === 'pick' || e.kind === 'chance') out.push(`${e.kind}:${e.data.key}=${e.data.value ?? e.data.pass}`)
    if (e.kind === 'pose') out.push(`pose:${e.data.to}`)
    if (e.kind === 'say') out.push('say')
    if (e.kind === 'busy') out.push(`busy:${e.data.busy}`)
  }
  if (route === 'engine' && run.timeline.engineTrace) {
    for (const e of run.timeline.engineTrace) {
      const t = e.type ?? e[0]
      if (['behavior:start', 'jump:windup', 'jump:launch', 'jump:land', 'intent:arrived', 'intent:say', 'behavior:complete', 'behavior:ended', 'intent:camera', 'cue:strikePose', 'cue:playClip'].includes(t)) out.push(t)
    }
  }
  return out
}

// ── main ─────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})

const summary = { base: BASE, scenarios: {}, errors: [] }
const names = ONLY.length > 0 ? ONLY : Object.keys(SCENARIOS)

if (NEGATIVE) {
  // Negative control: the SAME route + scenario with ONE forced beat flipped must
  // produce different checkpoints — proves the comparator can see a missing beat.
  const a = await runScenario(browser, 'legacy', 'negctl-a', SCENARIOS.hop, { 'hop.hang': false })
  const b = await runScenario(browser, 'legacy', 'negctl-b', SCENARIOS.hop, { 'hop.hang': true })
  const ca = checkpoints(a, 'legacy').join('|')
  const cb = checkpoints(b, 'legacy').join('|')
  await browser.close()
  if (ca === cb) {
    console.error('NEGATIVE CONTROL FAILED: hang on/off produced identical checkpoint timelines')
    process.exit(1)
  }
  console.log('negative control OK: forced-variant flip is visible in the timeline')
  console.log('  a:', ca.slice(0, 200))
  console.log('  b:', cb.slice(0, 200))
  process.exit(0)
}

for (const name of names) {
  const spec = SCENARIOS[name]
  if (!spec) { console.error('unknown scenario: ' + name); continue }
  console.log(`scenario ${name} …`)
  const runs = {}
  for (const route of ['legacy', 'engine']) {
    const run = await runScenario(browser, route, name, spec)
    runs[route] = run
    if (run.errors.length) summary.errors.push(...run.errors.map((e) => `${name}/${route}: ${e}`))
    if (SELF_CHECK) {
      const again = await runScenario(browser, route, name + '-again', spec)
      const c1 = checkpoints(run, route).join('|')
      const c2 = checkpoints(again, route).join('|')
      if (c1 !== c2) {
        summary.errors.push(`${name}/${route}: SELF-CHECK failed — two runs differ\n  1: ${c1}\n  2: ${c2}`)
      }
    }
  }
  const entry = {
    legacy: { checkpoints: checkpoints(runs.legacy, 'legacy'), frames: runs.legacy.frames.length, settleWaitMs: runs.legacy.settleWaitMs },
    engine: { checkpoints: checkpoints(runs.engine, 'engine'), frames: runs.engine.frames.length, settleWaitMs: runs.engine.settleWaitMs },
  }
  summary.scenarios[name] = entry
  writeFileSync(`${OUT}/${name}/timeline.json`, JSON.stringify({
    legacy: runs.legacy.timeline, engine: runs.engine.timeline,
    legacyFrames: runs.legacy.frames, engineFrames: runs.engine.frames,
  }, null, 2))
  console.log(`  legacy: ${entry.legacy.checkpoints.length} checkpoints; engine: ${entry.engine.checkpoints.length}`)
}

await browser.close()
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))
console.log('\nsummary → ' + OUT + '/summary.json')
if (summary.errors.length) {
  console.error('\nERRORS (' + summary.errors.length + '):')
  summary.errors.slice(0, 20).forEach((e) => console.error(' - ' + e))
  process.exit(1)
}
console.log('zero console/page errors across all runs')
