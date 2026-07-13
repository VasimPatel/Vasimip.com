// Stage 2b visual check: skinned engine vs legacy, idle + fight + walk strip.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || '/tmp/skin-check'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 },
})

async function crop(p, route, name) {
  const r = await p.evaluate((m) => {
    const el = m === 'legacy'
      ? document.querySelector('[data-dash-actor]')
      : document.querySelector('[data-dash-renderer]')
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }, route)
  if (!r) return console.log('no dash', route, name)
  const pad = 120
  await p.screenshot({ path: `${OUT}/${route}-${name}.png`, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: pad * 2, height: pad * 2 } })
}

for (const route of ['legacy', 'engine']) {
  const p = await b.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)))
  p.on('console', (m) => { if (m.type() === 'error' && !(m.location()?.url ?? '').includes('/api/')) errs.push(m.text().slice(0, 120)) })
  await p.evaluateOnNewDocument(() => { window.__dashReview = { seed: 7, force: { 'fidget.delayMs': 99999, 'flourish.roll': false, 'walk.trip': false } } })
  await p.goto(route === 'legacy' ? 'http://localhost:5178/legacy' : 'http://localhost:5178/', { waitUntil: 'networkidle2' })
  await sleep(600)
  // page 2 = About → fight arrival
  await p.evaluate(() => window.__notebookGoTo(2))
  await sleep(6000)
  await crop(p, route, 'about-arrival') // fight stance (persist)
  // walk strip on page 3
  await p.evaluate(() => window.__notebookGoTo(3))
  await sleep(6000)
  await crop(p, route, 'work-idle')
  await p.evaluate(() => window.__notebookRunBuiltin('walk'))
  for (let i = 0; i < 8; i++) { await crop(p, route, `walk-${i}`); await sleep(220) }
  await sleep(2000)
  await crop(p, route, 'settled')
  console.log(route, 'errors:', errs.length ? errs : 'none')
  await p.close()
}
await b.close()
console.log('→', OUT)
