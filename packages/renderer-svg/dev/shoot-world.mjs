// Screenshot harness for the Phase 6a world review page (dev-only).
// Usage: node shoot-world.mjs [baseURL] [outDir]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:5198') + '/world.html'
const OUT =
  process.argv[3] ||
  '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1100,1600'],
  defaultViewport: { width: 1100, height: 1600, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)

const shots = { graph: 'phase6a-graph.png', collision: 'phase6a-collision.png', rest: 'phase6a-rest.png' }
for (const [strip, file] of Object.entries(shots)) {
  // For the collision shot include the readout box (parent section captures both).
  const sel = strip === 'collision' ? `[data-strip="collision"]` : `[data-strip="${strip}"]`
  const el = await page.$(sel)
  if (!el) { errors.push(`strip ${strip} not found`); continue }
  if (strip === 'collision') {
    // capture the whole section (svg + readout)
    const section = await page.evaluateHandle((s) => document.querySelector(s).closest('section'), sel)
    await section.asElement().screenshot({ path: `${OUT}/${file}` })
  } else {
    await el.screenshot({ path: `${OUT}/${file}` })
  }
}

await browser.close()
console.log('shots →', OUT)
if (errors.length) { console.log('ERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
