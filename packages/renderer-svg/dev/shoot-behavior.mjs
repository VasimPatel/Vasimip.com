// Screenshot harness for the Phase 7a behavior review page (dev-only).
// Usage: node shoot-behavior.mjs [baseURL] [outDir]
// Produces phase7a-{walk-route,jump,blocked,fly}.png (+ phase7a-jump-1..6.png).
// Doubles as a smoke test: collects console.error / pageerror and prints them.
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
  args: ['--no-sandbox', '--window-size=1100,1000'],
  defaultViewport: { width: 1100, height: 1000, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const errors = []
// ignore the browser's automatic /favicon.ico 404 (the dev page ships no favicon);
// every other console.error / pageerror is a real smoke-test failure.
const isFavicon = (t) => /favicon\.ico/.test(t) || (/Failed to load resource/.test(t) && /404/.test(t))
page.on('console', (m) => { if (m.type() === 'error' && !isFavicon(m.text())) errors.push('console.error: ' + m.text()) })
page.on('requestfailed', () => {})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(500)

const evalw = (fn, ...args) => page.evaluate(fn, ...args)
const shot = async (file) => {
  const el = await page.$('[data-strip="behavior"]')
  await el.screenshot({ path: `${OUT}/${file}` })
}
// screenshot the whole review box (svg + readout) — used for blocked so the event
// readout is captured in the same frame.
const shotBox = async (file) => {
  const el = await page.$('.box')
  await el.screenshot({ path: `${OUT}/${file}` })
}

const run = async (which) => { await evalw((w) => window.__behavior.run(w), which); await evalw(() => window.__behavior.pause()) }
const step = async (n) => evalw((k) => window.__behavior.stepN(k), n)
const readout = () => evalw(() => window.__behavior.readout())

// ── 1. WALK: routed multi-leg moveTo with the planned-path overlay ─────────────────
await run('walk')
await step(2) // let begin() emit route/leg events so the overlay draws
// step until the route completes (arrived) so Dash lands framed on the far panel.
let wguard = 0
while ((await evalw(() => window.__behavior.status())) === 'running' && wguard++ < 30) await step(40)
await step(20) // a few settle frames
await sleep(120)
await shot('phase7a-walk-route.png')
console.log('walk readout:\n' + (await readout()))

// ── 2. JUMP: 6 labelled frames (anticipation/launch/apex/tuck/land/settle) ─────────
await run('jump')
// discover launch/land ticks by stepping until land is emitted, then rebuild fresh.
await step(140)
let launch = await evalw(() => window.__behavior.launchTick())
let land = await evalw(() => window.__behavior.landTick())
if (launch == null || land == null) { await step(80); launch = await evalw(() => window.__behavior.launchTick()); land = await evalw(() => window.__behavior.landTick()) }
console.log('jump launch tick=', launch, ' land tick=', land)
const apex = launch != null && land != null ? Math.round((launch + land) / 2) : null
const frames = launch != null && land != null
  ? [
      { label: 'anticipation', t: Math.max(1, launch - 6) },
      { label: 'launch', t: launch },
      { label: 'apex', t: apex },
      { label: 'tuck', t: Math.round((apex + launch) / 2) },
      { label: 'land', t: land },
      { label: 'settle', t: land + 14 },
    ]
  : [1, 12, 24, 36, 48, 62].map((t, i) => ({ label: ['anticipation', 'launch', 'apex', 'tuck', 'land', 'settle'][i], t }))
// tuck reads as a DESCENDING tuck — place it between apex and land so the 6-up
// strip runs chronologically: anticipation → launch → apex → tuck → land → settle.
frames[3].t = apex != null && land != null ? Math.round((apex + land) / 2) : frames[3].t

const jumpShots = []
for (let i = 0; i < frames.length; i++) {
  await run('jump') // fresh runtime each frame → deterministic
  await step(frames[i].t)
  await sleep(40)
  const file = `phase7a-jump-${i + 1}.png`
  await shot(file)
  jumpShots.push({ ...frames[i], file })
  console.log(`jump frame ${i + 1} (${frames[i].label}) @ tick ${frames[i].t}`)
}

// composite the 6 frames into a labelled 3×2 strip via an offscreen canvas in-page.
await page.setViewport({ width: 1500, height: 1100, deviceScaleFactor: 2 })
const composite = await page.evaluate(async (shots, outLabels) => {
  const svg = document.querySelector('[data-strip="behavior"]')
  const vb = svg.viewBox.baseVal
  // reproduce each frame by re-stepping, serialize the svg, rasterize into a tile.
  const cols = 3, rows = 2, tw = 480, th = 350, pad = 8, labelH = 22
  const cw = cols * tw + (cols + 1) * pad
  const ch = rows * (th + labelH) + (rows + 1) * pad
  const cv = document.createElement('canvas')
  cv.width = cw; cv.height = ch
  const g = cv.getContext('2d')
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, cw, ch)
  const rasterFrame = (t) =>
    new Promise((resolve) => {
      window.__behavior.run('jump')
      window.__behavior.stepN(t)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const s = new XMLSerializer().serializeToString(document.querySelector('[data-strip="behavior"]'))
        const img = new Image()
        img.onload = () => resolve(img)
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
      }))
    })
  for (let i = 0; i < shots.length; i++) {
    const col = i % cols, row = Math.floor(i / cols)
    const x = pad + col * (tw + pad)
    const y = pad + row * (th + labelH + pad)
    const img = await rasterFrame(shots[i].t)
    // fit the viewBox into the tile preserving aspect
    const scale = Math.min(tw / vb.width, th / vb.height)
    const dw = vb.width * scale, dh = vb.height * scale
    g.fillStyle = '#fffdf6'; g.fillRect(x, y, tw, th)
    g.drawImage(img, x + (tw - dw) / 2, y + (th - dh) / 2, dw, dh)
    g.fillStyle = '#1a1a1a'; g.font = '600 15px system-ui'
    g.fillText(`${i + 1}. ${outLabels[i]}  (tick ${shots[i].t})`, x + 6, y + th + 16)
  }
  return cv.toDataURL('image/png')
}, jumpShots.map((f) => ({ t: f.t })), jumpShots.map((f) => f.label))

// save the composite strip
const buf = Buffer.from(composite.split(',')[1], 'base64')
const { writeFileSync } = await import('node:fs')
writeFileSync(`${OUT}/phase7a-jump.png`, buf)
await page.setViewport({ width: 1100, height: 1000, deviceScaleFactor: 2 })

// ── 3. BLOCKED: capsule resting at the wall + the intent:blocked readout ───────────
await run('blocked')
await step(220) // walk into the wall and settle
await sleep(120)
await shotBox('phase7a-blocked.png')
console.log('blocked readout:\n' + (await readout()))

// ── 4. FLY: the waypoint trail after the swoop ─────────────────────────────────────
await run('fly')
await step(420) // fly through the waypoints, building the trail
await sleep(120)
await shot('phase7a-fly.png')
console.log('fly readout:\n' + (await readout()))

await browser.close()
console.log('\nshots →', OUT)
if (errors.length) { console.log('ERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
