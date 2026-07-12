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
// STATIONARY CLICK must be a poke, not a drag (review blocker): press+release
// with zero movement on the hitbox, expect a speech bubble (poke quip) and no thud.
await new Promise(r => setTimeout(r, 1200))
const hit = await p.evaluate(() => {
  const el = document.querySelector('[data-dash-poke]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
let clickPoked = false
if (hit) {
  await p.mouse.move(hit.x, hit.y)
  await p.mouse.down()
  await p.mouse.up()
  await new Promise(r => setTimeout(r, 700))
  clickPoked = await p.evaluate(() =>
    [...document.querySelectorAll('div')].some(d => d.textContent === 'Hey!' || (d.style.borderRadius && d.textContent.length > 2 && d.textContent.length < 40 && /[!?.]$/.test(d.textContent) && d.offsetHeight < 90 && d.offsetHeight > 10)))
  await p.screenshot({ path: `${SP}/9c-click-poke.png` })
}
console.log('stationary click produced a bubble:', clickPoked)

// DEV HOOKS route through the engine now: busy flips true while a builtin runs.
const hooks = await p.evaluate(async () => {
  const busy0 = window.__notebookBusy()
  window.__notebookRunBuiltin('hop')
  await new Promise(r => setTimeout(r, 300))
  const busy1 = window.__notebookBusy()
  await new Promise(r => setTimeout(r, 3500))
  const busy2 = window.__notebookBusy()
  return { busy0, busy1, busy2 }
})
console.log('engine dev hooks (busy before/during/after hop):', hooks)

// back-nav spectacle: go to page 3, then SPAM prev — the guard must serialize
// (exactly one page back per completed spectacle, no double flips).
await p.evaluate(() => window.__notebookGoTo && window.__notebookGoTo(3))
await new Promise(r => setTimeout(r, 2400))
await p.keyboard.press('ArrowLeft')
await new Promise(r => setTimeout(r, 120))
await p.keyboard.press('ArrowLeft')
await p.keyboard.press('ArrowLeft')
await new Promise(r => setTimeout(r, 500))
await p.screenshot({ path: `${SP}/9c-backnav.png` })
await new Promise(r => setTimeout(r, 2600))
const pageAfter = await p.evaluate(() => document.title + ' | hash:' + location.hash)
const pg = await p.evaluate(() => (window.__notebookBusy ? window.__notebookBusy() : 'n/a'))
await p.screenshot({ path: `${SP}/9c-backnav-settled.png` })
console.log('after ArrowLeft spam:', pageAfter, 'busy:', pg)
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none')
await b.close()
