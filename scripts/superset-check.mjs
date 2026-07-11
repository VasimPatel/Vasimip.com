// Probabilistic end-to-end check of the travel() superset: on the Work page,
// panel 0→1 transitions have `tightrope` spliced into the pool (1-in-7 pick).
// Do up to N round trips and detect the action's "don't look down." bubble.
// Usage: node scripts/superset-check.mjs [baseURL] [trips]
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:5178'
const TRIPS = Number(process.argv[3] || 24)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(600)
await page.evaluate(() => window.__notebookGoTo(3)) // Work page
await sleep(2800)

let seen = 0
for (let i = 0; i < TRIPS; i++) {
  // forward travel p0 -> p1 (the configured transition)
  await page.keyboard.press('ArrowRight')
  // watch for the tightrope bubble during the traversal window
  const hit = await page.evaluate(async () => {
    const until = Date.now() + 5200
    while (Date.now() < until) {
      if (document.body.innerText.includes("don't look down.")) return true
      if (!window.__notebookBusy() && Date.now() > until - 4000) break
      await new Promise((r) => setTimeout(r, 80))
    }
    return false
  })
  if (hit) seen++
  // wait for idle, then go back p1 -> p0
  await page.evaluate(async () => { while (window.__notebookBusy()) await new Promise((r) => setTimeout(r, 100)) })
  await sleep(300)
  await page.keyboard.press('ArrowLeft')
  await page.evaluate(async () => { while (window.__notebookBusy()) await new Promise((r) => setTimeout(r, 100)) })
  await sleep(300)
  if (seen >= 2) break // seen enough
}
await browser.close()
console.log(`tightrope picked ${seen}x in ${TRIPS} max round trips`)
if (errors.length) { console.log('ERRORS:'); errors.forEach((e) => console.log(' - ' + e)); process.exit(1) }
if (seen === 0) { console.log('WARN: never picked (P≈4.6% at 24 trips) — rerun or investigate'); process.exit(2) }
console.log('superset OK, no console errors')
