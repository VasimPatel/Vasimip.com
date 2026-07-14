import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2] || '/tmp/brow'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } })
const p = await b.newPage()
await p.evaluateOnNewDocument(() => { window.__dashReview = { seed: 7, force: { 'fidget.delayMs': 99999, 'flourish.roll': false } } })
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle2' })
await sleep(600)
await p.evaluate(() => window.__notebookGoTo(1))
await sleep(5000)
const at = await p.evaluate(() => {
  const el = document.querySelector('[data-dash-renderer]')
  const r = el?.getBoundingClientRect()
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height } : null
})
for (const [name, dx, dy] of [['above', 10, -120], ['level', 60, 0], ['below', 10, 130], ['below-near', 4, 70]]) {
  await p.mouse.move(at.x + dx, at.y + dy)
  await sleep(600)
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: at.x - 70, y: at.y - 90, width: 140, height: 140 } })
}
await b.close()
console.log('→', OUT)
