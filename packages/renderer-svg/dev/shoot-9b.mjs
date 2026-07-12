import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const errs = []
p.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[engine]')) errs.push('console: ' + m.text().slice(0, 200)) })
p.on('pageerror', e => errs.push('page: ' + e.message.slice(0, 200)))
await p.goto('http://localhost:5173/?engine=1', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.screenshot({ path: `${SP}/9b-cover.png` })
// open the notebook → page 1, let the arrival play
await p.evaluate(() => window.__notebookGoTo && window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 2600))
await p.screenshot({ path: `${SP}/9b-page1.png` })
// travel within the page (next → panel 2)
await p.keyboard.press('ArrowRight')
await new Promise(r => setTimeout(r, 1400))
await p.screenshot({ path: `${SP}/9b-travel.png` })
await new Promise(r => setTimeout(r, 2200))
await p.screenshot({ path: `${SP}/9b-arrived.png` })
console.log('errors:', errs.length ? errs.slice(0, 6) : 'none')
await b.close()
