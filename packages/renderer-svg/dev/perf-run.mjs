// Phase 5 perf runner — loads the budget scene at 4× CPU throttle (CDP), waits for the
// in-page 10 s measurement to publish window.__perf, prints it, and checks the §3 rule
// 3 budget (sim ≤ 2 ms/frame, writes ≤ 2 ms/frame). Reuses the Phase 0 approach:
// puppeteer-core + system Chrome + Emulation.setCPUThrottlingRate(4).
// Usage: node perf-run.mjs [baseURL]
import puppeteer from 'puppeteer-core'

const BASE = (process.argv[2] || 'http://localhost:5197') + '/perf.html'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=800,700'],
  defaultViewport: { width: 800, height: 700, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const client = await page.target().createCDPSession()
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })

// wait up to ~25s wall for the 10s (sim-time) measurement to finish under throttle
let perf = null
for (let i = 0; i < 60; i++) {
  await sleep(1000)
  perf = await page.evaluate(() => window.__perf ?? null)
  if (perf) break
}

await browser.close()

if (!perf) {
  console.log('PERF: no result (window.__perf never set)')
  if (errors.length) errors.forEach((e) => console.log(' - ' + e))
  process.exit(1)
}

console.log('[P5 perf @4× throttle] budget scene: 2 chars + 1 rope + 10 props + 4 free particles, all live')
console.log(JSON.stringify(perf, null, 2))
const simOk = perf.simMsAvg <= 2
const writeOk = perf.writeMsAvg <= 2
console.log(`sim avg ${perf.simMsAvg.toFixed(3)}ms (p95 ${perf.simMsP95.toFixed(3)}) → ${simOk ? 'PASS' : 'FAIL'} (budget ≤2ms)`)
console.log(`write avg ${perf.writeMsAvg.toFixed(3)}ms (p95 ${perf.writeMsP95.toFixed(3)}) → ${writeOk ? 'PASS' : 'FAIL'} (budget ≤2ms)`)
if (errors.length) { console.log('ERRORS:'); errors.forEach((e) => console.log(' - ' + e)) }
process.exit(simOk && writeOk ? 0 : 2)
