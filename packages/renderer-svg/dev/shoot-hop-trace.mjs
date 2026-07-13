import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 5500))
// sample Dash's page-space x/y at 40ms during a hop
const samples = await p.evaluate(async () => {
  const out = []
  const g = document.querySelector('[data-dash-renderer]')
  const read = () => {
    const r = g.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  }
  window.__notebookRunBuiltin('hop')
  const t0 = performance.now()
  while (performance.now() - t0 < 2400) {
    out.push({ t: Math.round(performance.now() - t0), ...read() })
    await new Promise(r => setTimeout(r, 40))
  }
  return out
})
let launched = false
for (const s of samples.filter((_, i) => i % 2 === 0)) console.log(s.t, 'x', s.x, 'y', s.y)
await b.close()
