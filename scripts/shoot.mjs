// Headless screenshot harness for the Dash notebook.
// Usage: node scripts/shoot.mjs [baseURL] [outDir]
// Drives the running dev server, jumps pages via window.__notebookGoTo, and
// captures a screenshot per page plus any console/page errors.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = process.argv[3] || '/tmp/dash-shots'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(800)
await page.screenshot({ path: `${OUT}/0-cover.png` })

const names = ['1-intro', '2-about', '3-work', '4-skills', '5-contact']
for (let p = 1; p <= 5; p++) {
  const ok = await page.evaluate((n) => {
    const fn = window.__notebookGoTo
    if (typeof fn !== 'function') return false
    fn(n)
    return true
  }, p)
  if (!ok) { errors.push(`__notebookGoTo missing at page ${p}`); break }
  await sleep(2600) // let the page-flip + Dash traversal settle
  await page.screenshot({ path: `${OUT}/${names[p - 1]}.png` })
}

await browser.close()
console.log('shots →', OUT)
if (errors.length) { console.log('\nERRORS (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('no console/page errors captured')
