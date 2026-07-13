import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const logs = []
p.on('console', m => { const t = m.text(); if (t.includes('behavior:start')) logs.push(t.slice(0, 90)) })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 5000))
for (let i = 0; i < 14; i++) {
  const c = await p.evaluate(() => {
    const el = document.querySelector('[data-dash-poke]')
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await p.screenshot({ path: `${SP}/dense-${String(i).padStart(2, '0')}.png`, clip: { x: c.x - 90, y: c.y - 100, width: 190, height: 190 } })
  await new Promise(r => setTimeout(r, 700))
}
console.log(logs.join('\n'))
await b.close()
