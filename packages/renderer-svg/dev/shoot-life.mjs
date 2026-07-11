// Screenshot harness for the Phase 4 life review page (dev-only). Captures the full
// page plus one crop per section (idle / walk / look).
// Usage: node packages/renderer-svg/dev/shoot-life.mjs [baseURL] [outDir]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:5197') + '/life.html'
const OUT =
  process.argv[3] ||
  '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1200,1400'],
  defaultViewport: { width: 1200, height: 1400, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(700)
await page.screenshot({ path: `${OUT}/phase4-life.png`, fullPage: true })

for (const id of ['idle', 'walk', 'look']) {
  const clip = await page.evaluate((sid) => {
    const el = document.querySelector(`[data-strip="${sid}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.max(0, r.left), y: Math.max(0, r.top + window.scrollY), width: r.width, height: r.height }
  }, id)
  if (!clip) { errors.push(`section ${id} not found`); continue }
  await page.screenshot({ path: `${OUT}/phase4-${id}.png`, clip, captureBeyondViewport: true })
}

await browser.close()
console.log('shots →', OUT)
if (errors.length) { console.log('ERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
