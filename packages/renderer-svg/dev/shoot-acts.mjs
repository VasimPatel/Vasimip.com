import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message.slice(0, 90)))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
const box = async () => p.evaluate(() => {
  const el = document.querySelector('[data-dash-poke]')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
// FIGHT: page 2 (ABOUT), arrival on panel 0 after the entrance stroll
await p.evaluate(() => window.__notebookGoTo(2))
await new Promise(r => setTimeout(r, 6200))
let c = await box()
await p.screenshot({ path: `${SP}/act-fight-1.png`, clip: { x: c.x - 150, y: c.y - 150, width: 340, height: 300 } })
await new Promise(r => setTimeout(r, 1300))
c = await box()
await p.screenshot({ path: `${SP}/act-fight-2.png`, clip: { x: c.x - 150, y: c.y - 150, width: 340, height: 300 } })
// SPRAY: page 4 (SKILLS) — the arrival spray holds only 2.1s after the stroll
await p.evaluate(() => window.__notebookGoTo(4))
await new Promise(r => setTimeout(r, 3300))
c = await box()
await p.screenshot({ path: `${SP}/act-spray.png`, clip: { x: c.x - 150, y: c.y - 150, width: 340, height: 300 } })
await new Promise(r => setTimeout(r, 700))
c = await box()
await p.screenshot({ path: `${SP}/act-spray2.png`, clip: { x: c.x - 150, y: c.y - 150, width: 340, height: 300 } })
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none')
await b.close()
