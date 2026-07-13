import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const logs = []
p.on('console', m => { const t = m.text(); if (t.includes('behavior:') || t.includes('intent:')) logs.push(t.slice(8, 100)) })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 5500))
// launch a hop, then CLICK Dash mid-flight — the trip must NOT cancel
await p.evaluate(() => window.__notebookRunBuiltin('hop'))
await new Promise(r => setTimeout(r, 700))
const c = await p.evaluate(() => {
  const el = document.querySelector('[data-dash-poke]')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await p.mouse.move(c.x, c.y)
await p.mouse.down(); await p.mouse.up()
await new Promise(r => setTimeout(r, 2500))
const busy = await p.evaluate(() => window.__notebookBusy())
console.log('after mid-jump click: busy=', busy)
console.log(logs.filter(l => l.includes('interrupted') || l.includes('complete')).join('\n') || 'no terminal events captured')
await b.close()
