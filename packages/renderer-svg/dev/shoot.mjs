// Screenshot harness for the Phase 2 pose review page (dev-only). Modeled on
// scripts/shoot.mjs. Captures the full comparison grid plus one crop per pose.
// Usage: node packages/renderer-svg/dev/shoot.mjs [baseURL] [outDir]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5197'
const OUT =
  process.argv[3] ||
  '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=760,1200'],
  defaultViewport: { width: 760, height: 1200, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(600)
await page.screenshot({ path: `${OUT}/phase2-poses.png`, fullPage: true })

const ids = ['stand', 'walk-mid', 'jump-tuck', 'cheer', 'think', 'squash-land']
for (const id of ids) {
  const clip = await page.evaluate((rowId) => {
    const legacy = document.querySelector(`[data-legacy="${rowId}"]`)
    const neu = document.querySelector(`[data-new="${rowId}"]`)
    if (!legacy || !neu) return null
    const a = legacy.getBoundingClientRect()
    const b = neu.getBoundingClientRect()
    const x = Math.min(a.left, b.left)
    const y = Math.min(a.top, b.top)
    const right = Math.max(a.right, b.right)
    const bottom = Math.max(a.bottom, b.bottom)
    return { x, y, width: right - x, height: bottom - y }
  }, id)
  if (!clip) { errors.push(`row ${id} not found`); continue }
  await page.screenshot({ path: `${OUT}/phase2-${id}.png`, clip })
}

await browser.close()
console.log('shots →', OUT)
if (errors.length) { console.log('ERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
