import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 4000))
const r = await p.evaluate(() => {
  const el = document.querySelector('[data-dash-renderer]')
  const rr = el.getBoundingClientRect()
  return { x: rr.x, y: rr.y, w: rr.width, h: rr.height }
})
console.log('dash bbox', r)
await p.screenshot({ path: `${SP}/site-idle-zoom.png`, clip: { x: r.x - 30, y: r.y - 30, width: r.w + 60, height: r.h + 60 } })
console.log('errors:', errs.length ? errs.slice(0,3) : 'none')
await b.close()
