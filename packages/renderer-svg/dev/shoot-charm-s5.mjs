// Stage 5 charm review: LARGE side-by-side crops (device scale 2) of the key
// states on both routes — idle near/far, fight, spray reveal, think, landing.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || '/tmp/charm-s5'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
})

async function crop(p, route, name, pad = 130) {
  const r = await p.evaluate((m) => {
    const el = m === 'legacy'
      ? document.querySelector('[data-dash-actor]')
      : document.querySelector('[data-dash-renderer]')
    if (!el) return null
    const b2 = el.getBoundingClientRect()
    return { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 }
  }, route)
  if (!r) return console.log('no dash', route, name)
  await p.screenshot({ path: `${OUT}/${name}-${route}.png`, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: pad * 2, height: pad * 2 } })
}

for (const route of ['legacy', 'engine']) {
  const p = await b.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)))
  await p.evaluateOnNewDocument(() => {
    window.__dashReview = { seed: 7, force: { 'fidget.delayMs': 99999, 'flourish.roll': false, 'walk.trip': false, 'flip.surf': false } }
  })
  await p.goto(route === 'legacy' ? 'http://localhost:5178/legacy' : 'http://localhost:5178/', { waitUntil: 'networkidle2' })
  await sleep(600)

  // INTRO idle (page 1): near + far cursor
  await p.evaluate(() => window.__notebookGoTo(1))
  await sleep(5000)
  const at = await p.evaluate((m) => {
    const el = m === 'legacy' ? document.querySelector('[data-dash-actor]') : document.querySelector('[data-dash-renderer]')
    const r = el?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  }, route)
  if (at && at.x > 0 && at.x < 1440) {
    await p.mouse.move(at.x + 55, at.y - 15)
    await sleep(700)
    await crop(p, route, 'idle-near')
    await p.mouse.move(60, 60)
    await sleep(700)
  }
  await crop(p, route, 'idle-far')

  // ABOUT fight (persist)
  await p.evaluate(() => window.__notebookGoTo(2))
  await sleep(6000)
  await crop(p, route, 'fight')

  // WORK think (if authored) — panel arrival states
  await p.evaluate(() => window.__notebookGoTo(3))
  await sleep(6000)
  await crop(p, route, 'work')

  // SKILLS spray (once) — catch the reveal beat
  await p.evaluate(() => window.__notebookGoTo(4))
  await sleep(2500)
  await crop(p, route, 'spray')
  await sleep(4000)
  await crop(p, route, 'skills-settled')

  console.log(route, errs.length ? errs : 'clean')
  await p.close()
}
await b.close()
console.log('→', OUT)
