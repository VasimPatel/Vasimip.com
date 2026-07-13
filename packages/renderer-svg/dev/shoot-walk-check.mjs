import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 760, deviceScaleFactor: 2 } })
const p = await b.newPage()
await p.goto('http://localhost:5197/dev/charm.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
const btns = await p.$$('button')
await btns[0].click() // stroll
await new Promise(r => setTimeout(r, 700))
for (let i = 0; i < 8; i++) {
  const r = await p.evaluate(() => {
    const el = document.querySelector('[data-dash-renderer]')
    const rr = el.getBoundingClientRect()
    return { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2 }
  })
  await p.screenshot({ path: `${SP}/walk-${String(i).padStart(2, '0')}.png`, clip: { x: r.x - 70, y: r.y - 90, width: 150, height: 180 } })
  await new Promise(r2 => setTimeout(r2, 110))
}
await b.close()
