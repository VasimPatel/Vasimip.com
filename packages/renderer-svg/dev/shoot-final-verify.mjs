import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 5200))
const box = async () => p.evaluate(() => {
  const el = document.querySelector('[data-dash-poke]')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
// far vs near face zoom (dilation + lean)
await p.mouse.move(120, 120)
await new Promise(r => setTimeout(r, 1200))
let c = await box()
await p.screenshot({ path: `${SP}/f-far.png`, clip: { x: c.x - 60, y: c.y - 90, width: 130, height: 150 } })
await p.mouse.move(c.x + 50, c.y - 40)
await new Promise(r => setTimeout(r, 1200))
c = await box()
await p.screenshot({ path: `${SP}/f-near.png`, clip: { x: c.x - 60, y: c.y - 90, width: 130, height: 150 } })
// landing settle: run hop, wait until descent, then rapid frames at the land
await p.mouse.move(120, 120)
await p.evaluate(() => window.__notebookRunBuiltin('hop'))
await new Promise(r => setTimeout(r, 900))
for (let i = 0; i < 10; i++) {
  const d = await box()
  await p.screenshot({ path: `${SP}/land-${String(i).padStart(2, '0')}.png`, clip: { x: d.x - 80, y: d.y - 90, width: 170, height: 170 } })
  await new Promise(r => setTimeout(r, 70))
}
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none')
await b.close()
