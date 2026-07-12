// Screenshot harness for the Phase 6b mutable-boundaries review page (dev-only).
// Usage: node shoot-world6b.mjs [baseURL] [outDir]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:5198') + '/world6b.html'
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
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(600)

const shot = async (file) => {
  const el = await page.$('[data-strip="world6b"]')
  await el.screenshot({ path: `${OUT}/${file}` })
}
const evalw = (fn, ...args) => page.evaluate(fn, ...args)

// pause the live loop so screenshots are deterministic
await evalw(() => window.__world6b.pause())

const panels = await evalw(() => window.__world6b.panels())
const total = await evalw(() => window.__world6b.totalTicks)

// ── 1. CUT: tear several edges on the big, clearly-visible top-left panel ──────────
// roof, right wall, and bottom → three torn masks + a live graph overlay. Put the
// probe capsule inside a smaller panel so its enclosure highlight doesn't dominate.
const big = panels[0]
await evalw((id, x, y) => window.__world6b.cutEdge(id, x, y), big.entity, big.box.x + big.box.w * 0.4, big.box.y) // roof
await evalw((id, x, y) => window.__world6b.cutEdge(id, x, y), big.entity, big.box.x + big.box.w, big.box.y + big.box.h * 0.55) // right wall
await evalw((id, x, y) => window.__world6b.cutEdge(id, x, y), big.entity, big.box.x + big.box.w * 0.65, big.box.y + big.box.h) // bottom
// capsule inside a smaller panel (the last one) to show isEnclosed elsewhere
const small = panels[panels.length - 1]
await evalw((x, y) => window.__world6b.setCap(x, y), small.box.x + small.box.w / 2, small.box.y + small.box.h / 2)
await evalw(() => window.__world6b.stepN(0)) // force a re-render
await sleep(120)
await shot('phase6b-cut.png')

// ── 2. HEAL: advance ~70% through the countdown → the masks visibly knit back ─────
await evalw((n) => window.__world6b.stepN(n), Math.floor(total * 0.7))
await sleep(120)
await shot('phase6b-heal.png')

// ── 3. PROJECTILE: finish healing, then fire a laser that cuts on impact ───────────
await evalw((n) => window.__world6b.stepN(n), total + 4) // clear remaining holes
await evalw(() => window.__world6b.fire())
// step until the first laser cuts a hole
let guard = 0
while ((await evalw(() => window.__world6b.holeCount())) === 0 && guard++ < 30) {
  await evalw(() => window.__world6b.stepN(1))
}
await evalw(() => window.__world6b.fire()) // a second laser, caught mid-flight (visible red dot)
await evalw(() => window.__world6b.stepN(5))
await sleep(120)
await shot('phase6b-projectile.png')

await browser.close()
console.log('shots →', OUT)
if (errors.length) { console.log('ERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
