import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2] || '/tmp/q5-cam'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
await p.evaluateOnNewDocument(() => { window.__dashReview = { seed: 7, force: { 'walk.trip': false, 'vault.peek': false, 'flourish.roll': false, 'flip.surf': false, 'fidget.delayMs': 99999 } } })
await p.goto('http://localhost:5178/', { waitUntil: 'networkidle2' })
await sleep(600)
await p.evaluate(() => window.__notebookGoTo(2))
await sleep(1200)
for (let w = 0; w < 40; w++) { if (!(await p.evaluate(() => window.__notebookBusy?.()))) break; await sleep(250) }
await p.evaluate(() => window.__notebookRunBuiltin('vault'))
for (let i = 0; i < 10; i++) { await p.screenshot({ path: `${OUT}/v${String(i).padStart(2, '0')}.png` }); await sleep(450) }
await b.close()
console.log('→', OUT)
