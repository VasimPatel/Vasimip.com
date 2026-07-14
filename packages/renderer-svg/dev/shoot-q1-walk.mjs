// Q1 visual check: dense strip of the entrance stroll — the walk skin must CYCLE
// with traveled distance (legs/arms swinging), anchored to a flat support line.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2] || '/tmp/q1-walk'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
p.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 100)))
await p.evaluateOnNewDocument(() => { window.__dashReview = { seed: 7, force: { 'walk.trip': false, 'flourish.roll': false, 'flip.surf': false, 'fidget.delayMs': 99999 } } })
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle2' })
await sleep(600)
await p.evaluate(() => window.__notebookGoTo(2))
await sleep(1200)
for (let w = 0; w < 40; w++) { if (!(await p.evaluate(() => window.__notebookBusy?.()))) break; await sleep(250) }
await p.evaluate(() => window.__notebookGoTo(3)) // forward flip → entrance stroll
await sleep(900) // flip lands ~820ms
for (let i = 0; i < 14; i++) {
  const r = await p.evaluate(() => {
    const el = document.querySelector('[data-dash-renderer]')
    const b2 = el?.getBoundingClientRect()
    return b2 ? { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 } : null
  })
  if (r) await p.screenshot({ path: `${OUT}/w${String(i).padStart(2, '0')}.png`, clip: { x: Math.max(0, r.x - 90), y: Math.max(0, r.y - 90), width: 180, height: 180 } })
  await sleep(110)
}
await b.close()
console.log('→', OUT)
