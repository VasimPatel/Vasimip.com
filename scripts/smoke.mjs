// Interactive smoke test: exercise the paths static screenshots can't reach —
// back-navigation (bomb/poof), poke, and the auto/sound toggles — asserting no
// console/page errors. Usage: node scripts/smoke.mjs [baseURL] [outDir]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5178'
const OUT = process.argv[3] || '/tmp/dash-smoke'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

// click a HUD control by its visible text
async function clickHud(text) {
  const clicked = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === t)
    if (!el) return false
    el.click(); return true
  }, text)
  return clicked
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(600)

// jump to Work (pg3), let it settle
await page.evaluate(() => window.__notebookGoTo(3))
await sleep(2600)

// POKE Dash — mode-aware: the engine hitbox ([data-dash-poke]) or the legacy
// character svg. Real pointer sequence (move/down/up) so the engine's drag-vs-
// click disambiguation is actually exercised. Missing both = FAILURE.
const pokeAt = await page.evaluate(() => {
  const el = document.querySelector('[data-dash-poke]') ||
    document.querySelector('svg[viewBox="-60 -75 120 130"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
if (!pokeAt) { console.error('FAIL: no poke target found (engine hitbox or legacy svg)'); await browser.close(); process.exit(1) }
if (pokeAt.x >= 0 && pokeAt.x < 1440 && pokeAt.y >= 0 && pokeAt.y < 900) {
  await page.mouse.move(pokeAt.x, pokeAt.y)
  await page.mouse.down()
  await page.mouse.up()
} else {
  // target is outside the viewport (legacy camera pan) — synthetic full press
  // sequence on the element itself so the poke path still runs
  await page.evaluate(() => {
    const el = document.querySelector('[data-dash-poke]') ||
      document.querySelector('svg[viewBox="-60 -75 120 130"]')
    for (const type of ['mousedown', 'mouseup', 'click'])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true }))
  })
  console.log('poke: synthetic (target off-viewport)')
}
await sleep(900)
await page.screenshot({ path: `${OUT}/poke.png` })
console.log('poked at', pokeAt)

// BACK-NAV: click prev (◀) — triggers travel back, then bomb/poof between pages
await clickHud('◀') // ◀
await sleep(1400)
await page.screenshot({ path: `${OUT}/back-1.png` }) // mid bomb/poof
await sleep(2600)
await page.screenshot({ path: `${OUT}/back-2.png` })

// AUTO on, let it advance once, AUTO off
await clickHud('auto: off')
await sleep(3200)
await page.screenshot({ path: `${OUT}/auto.png` })
const autoLabel = await page.evaluate(() =>
  [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => t.startsWith('auto:')))
await clickHud(autoLabel) // toggle off
await sleep(400)

// SOUND toggle
const soundLabel = await page.evaluate(() =>
  [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => t.startsWith('sound:')))
await clickHud(soundLabel)
await sleep(300)

await browser.close()
console.log('smoke shots →', OUT)
if (errors.length) {
  console.log('\nERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e))
  process.exit(1)
}
console.log('no console/page errors during interaction')
