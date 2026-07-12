import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const errs = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
p.on('pageerror', e => errs.push('page: ' + e.message.slice(0, 120)))
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 900))
await p.evaluate(() => window.__notebookGoTo && window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 2600))
// find the poke hitbox position and DRAG Dash across the page
const box = await p.evaluate(() => {
  const el = document.querySelector('[data-dash-renderer]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
if (box) {
  await p.mouse.move(box.x, box.y)
  await p.mouse.down()
  for (let i = 1; i <= 14; i++) {
    await p.mouse.move(box.x + i * 22, box.y - i * 6)
    await new Promise(r => setTimeout(r, 40))
  }
  await p.screenshot({ path: `${SP}/9c-drag.png` })
  await p.mouse.up()
  await new Promise(r => setTimeout(r, 900))
  await p.screenshot({ path: `${SP}/9c-dropped.png` })
}
// back-nav spectacle: go to page 3, then prev across the page boundary
await p.evaluate(() => window.__notebookGoTo && window.__notebookGoTo(3))
await new Promise(r => setTimeout(r, 2400))
await p.keyboard.press('ArrowLeft')
await new Promise(r => setTimeout(r, 500))
await p.screenshot({ path: `${SP}/9c-backnav.png` })
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none')
await b.close()
