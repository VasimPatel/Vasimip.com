import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(4))
await new Promise(r => setTimeout(r, 1500))
for (let i = 0; i < 12; i++) {
  const c = await p.evaluate(() => {
    const el = document.querySelector('[data-dash-poke]')
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await p.screenshot({ path: `${SP}/sprayst-${String(i).padStart(2, '0')}.png`, clip: { x: c.x - 90, y: c.y - 90, width: 200, height: 180 } })
  await new Promise(r => setTimeout(r, 400))
}
await b.close()
