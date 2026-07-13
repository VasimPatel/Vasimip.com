import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const errs = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
p.on('pageerror', e => errs.push('page: ' + e.message.slice(0, 120)))
// ENGINE at the default path
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 900))
const engineDefault = await p.evaluate(() => { window.__notebookGoTo && window.__notebookGoTo(1); return true })
await new Promise(r => setTimeout(r, 2400))
// travel and catch the camera MID-FLIGHT
await p.keyboard.press('ArrowRight')
await new Promise(r => setTimeout(r, 750))
await p.screenshot({ path: `${SP}/9c-midtravel.png` })
await new Promise(r => setTimeout(r, 2000))
await p.screenshot({ path: `${SP}/9c-arrived.png` })
const hasEngineDash = await p.evaluate(() => !!document.querySelector('[data-dash-renderer]'))
// LEGACY route
await p.goto('http://localhost:5173/legacy', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 900))
await p.evaluate(() => window.__notebookGoTo && window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 2400))
await p.screenshot({ path: `${SP}/9c-legacy.png` })
const hasLegacyEngineDash = await p.evaluate(() => !!document.querySelector('[data-dash-renderer]'))
console.log('engine@/ dash:', hasEngineDash, '| /legacy engine-dash present (must be false):', hasLegacyEngineDash)
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none')
await b.close()
void engineDefault
