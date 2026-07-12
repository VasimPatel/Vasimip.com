// Screenshot harness for the Phase 7b behavior review page (dev-only).
// Usage: node shoot-behavior7b.mjs [baseURL] [outDir]
// Produces phase7b-{walltest,builtins,say}.png. Doubles as a smoke test.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:5199') + '/behavior.html'
const OUT =
  process.argv[3] ||
  '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1300,1000'],
  defaultViewport: { width: 1300, height: 1000, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const errors = []
const isFavicon = (t) => /favicon\.ico/.test(t) || (/Failed to load resource/.test(t) && /404/.test(t))
page.on('console', (m) => { if (m.type() === 'error' && !isFavicon(m.text())) errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(500)

const evalw = (fn, ...args) => page.evaluate(fn, ...args)
const run = async (which) => { await evalw((w) => window.__behavior.run(w), which); await evalw(() => window.__behavior.pause()) }
const step = async (n) => evalw((k) => window.__behavior.stepN(k), n)
const readout = () => evalw(() => window.__behavior.readout())
const shotBox = async (file) => {
  const el = await page.$('[data-strip="behavior"]')
  await el.screenshot({ path: `${OUT}/${file}` })
}

// ── 1. WALL TEST: both panels — enclosed bonk (left) vs clean traversal (right) ─────
await run('walltest')
// step until BOTH actors have concluded (left blocked+reacted, right arrived); then a
// few more so the "ow!" bubble is still up while the captions show the full reaction.
await step(70) // left blocks and fires the reaction (bonk → "ow!")
await sleep(60)
await step(150) // right traverses to the goal; left's bubble is still decaying
await sleep(150)
await shotBox('phase7b-walltest.png')
console.log('walltest readout:\n' + (await readout()))

// ── 2. BUILT-INS: vault caught mid-flourish (onLaunch strikePose cue) ──────────────
await run('vault')
await step(300) // run to completion to discover the launch tick
const vlaunch = await evalw(() => window.__behavior.launchTick())
console.log('vault launch tick =', vlaunch)
await run('vault')
await step((vlaunch ?? 40) + 6) // a few ticks past launch → mid-air, flourish pose struck
await sleep(120)
await shotBox('phase7b-builtins.png')
console.log('vault readout:\n' + (await readout()))

// ── 3. SAY bubble: tightrope's "steady…" line during the traverse ──────────────────
await run('tightrope')
await step(80) // past the think pose, during the "steady…" bubble's lifetime
await sleep(120)
await shotBox('phase7b-say.png')
console.log('tightrope readout:\n' + (await readout()))

await browser.close()
console.log('\nshots →', OUT)
if (errors.length) { console.log('ERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
