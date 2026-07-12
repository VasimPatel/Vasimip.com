import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1060, height: 1500 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:5197/poses9a.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
await p.screenshot({ path: `${SP}/poses9a-grid.png`, fullPage: true })
console.log('errors:', errs.length ? errs : 'none')
await b.close()
