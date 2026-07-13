// Parity Stage 0 soak: long-running fidget/poke/drop/nav churn on the engine route,
// asserting zero console/page errors and that busy always clears (no wedge).
// Usage: node scripts/soak.mjs [baseURL] [seconds]
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:5178'
const SECONDS = Number(process.argv[3] || 600)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const t0 = Date.now()
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const errors = []
const noteErr = (msg) => { errors.push(msg); console.log('ERR@' + Math.round((Date.now() - t0) / 1000) + 's: ' + msg) }
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // The live-doc fetch (/api/*) 502s in backend-less review environments and the
  // app falls back to the baked doc by design — that resource failure is the ONLY
  // tolerated console error. Everything else is a defect.
  const url = m.location()?.url ?? ''
  if (m.text().startsWith('Failed to load resource') && url.includes('/api/')) return
  noteErr('console.error: ' + m.text())
})
page.on('pageerror', (e) => noteErr('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(600)
await page.evaluate(() => window.__notebookGoTo(2))
await sleep(2600)

async function dashCenter() {
  return page.evaluate(() => {
    const el = document.querySelector('[data-dash-poke]') ||
      document.querySelector('svg[viewBox="-60 -75 120 130"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
}
const onScreen = (p) => p && p.x >= 10 && p.x < 1430 && p.y >= 10 && p.y < 890

let cycles = 0
let pokes = 0
let drags = 0
let navs = 0
let busySince = null

while ((Date.now() - t0) / 1000 < SECONDS) {
  // one idle fidget window
  await sleep(4000 + Math.random() * 3000)

  // busy-wedge watchdog: busy for >20s continuously = wedge → fail
  const busy = await page.evaluate(() => window.__notebookBusy?.() ?? false)
  if (busy) {
    if (busySince === null) busySince = Date.now()
    else if (Date.now() - busySince > 20000) {
      errors.push('WEDGE: __notebookBusy() stayed true for >20s')
      break
    }
  } else busySince = null

  const roll = cycles % 5
  if (roll === 1 || roll === 3) {
    const p = await dashCenter()
    if (onScreen(p)) {
      await page.mouse.move(p.x, p.y)
      await page.mouse.down()
      await page.mouse.up()
      pokes++
    }
  } else if (roll === 2) {
    const p = await dashCenter()
    if (onScreen(p)) {
      await page.mouse.move(p.x, p.y)
      await page.mouse.down()
      for (let i = 1; i <= 10; i++) await page.mouse.move(p.x + i * 12, p.y - i * 5)
      await sleep(300)
      await page.mouse.up()
      drags++
      await sleep(1800)
    }
  } else if (roll === 4) {
    // alternate forward/back navigation to churn arrivals + back-nav beats
    const dir = navs % 2 === 0 ? 3 : 2
    await page.evaluate((d) => window.__notebookGoTo(d), dir)
    navs++
    await sleep(4500)
  }
  cycles++
  if (cycles % 10 === 0) {
    const el = Math.round((Date.now() - t0) / 1000)
    console.log(`soak ${el}s: cycles=${cycles} pokes=${pokes} drags=${drags} navs=${navs} errors=${errors.length}`)
  }
}

await browser.close()
const total = Math.round((Date.now() - t0) / 1000)
console.log(`soak done: ${total}s, cycles=${cycles} pokes=${pokes} drags=${drags} navs=${navs}`)
if (errors.length) {
  console.log('\nERRORS (' + errors.length + '):')
  errors.slice(0, 20).forEach((e) => console.log(' - ' + e))
  process.exit(1)
}
console.log('PASS: zero console/page errors, no busy wedge')
