// Parity Stage 7 — INTEGRATED performance comparison: the real notebook route,
// production build, both modes, several viewports, optional CPU throttle.
// Measures rAF frame deltas through a busy scenario (entrance + travel + idle
// fidgeting) plus JS heap growth, and prints a table.
// Usage: node scripts/perf-compare.mjs [baseURL] [--throttle=4]
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199'
const throttleArg = process.argv.find((a) => a.startsWith('--throttle='))
const THROTTLE = throttleArg ? Number(throttleArg.split('=')[1]) : 1
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

function stats(deltas) {
  const s = [...deltas].sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  const avg = s.reduce((a, b) => a + b, 0) / s.length
  const long = s.filter((d) => d > 50).length
  return { avg: avg.toFixed(1), p95: q(0.95).toFixed(1), p99: q(0.99).toFixed(1), longPct: ((100 * long) / s.length).toFixed(2), n: s.length }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox'],
})

const rows = []
for (const vp of VIEWPORTS) {
  for (const route of ['legacy', 'engine']) {
    const p = await browser.newPage()
    await p.setViewport({ width: vp.width, height: vp.height })
    const cdp = await p.createCDPSession()
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
    await p.evaluateOnNewDocument(() => {
      window.__dashReview = { seed: 7, force: { 'fidget.delayMs': 2500 } }
      window.__frames = []
      let last = performance.now()
      const loop = (t) => {
        window.__frames.push(t - last)
        last = t
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    })
    await p.goto(route === 'legacy' ? `${BASE}/legacy` : `${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 })
    await sleep(500)
    const heap0 = (await cdp.send('Runtime.getHeapUsage')).usedSize

    // scenario: open → About (entrance + fight arrival) → travel → Work → idle
    await p.evaluate(() => window.__frames.length = 0)
    await p.evaluate(() => window.__notebookGoTo(2))
    await sleep(5000)
    await p.evaluate(() => window.__notebookRunBuiltin('hop'))
    await sleep(3500)
    await p.evaluate(() => window.__notebookGoTo(3))
    await sleep(5000)
    await p.evaluate(() => window.__notebookRunBuiltin('vault'))
    await sleep(4500)
    await sleep(6000) // idle + fidgets

    const deltas = await p.evaluate(() => window.__frames.slice(5))
    const heap1 = (await cdp.send('Runtime.getHeapUsage')).usedSize
    const st = stats(deltas)
    rows.push({ viewport: vp.name, route, ...st, heapMB: ((heap1 - heap0) / 1048576).toFixed(1) })
    console.log(`${vp.name}/${route}: avg ${st.avg}ms p95 ${st.p95}ms p99 ${st.p99}ms long ${st.longPct}% heapΔ ${rows[rows.length - 1].heapMB}MB`)
    await p.close()
  }
}
await browser.close()

console.log(`\n| viewport | route | avg ms | p95 ms | p99 ms | >50ms | heap Δ MB | (throttle ×${THROTTLE})`)
console.log('|---|---|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.viewport} | ${r.route} | ${r.avg} | ${r.p95} | ${r.p99} | ${r.longPct}% | ${r.heapMB} |`)
