import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 760 } })
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:5197/dev/charm.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2500))
await p.screenshot({ path: `${SP}/charm-idle-now.png` })
console.log('errors:', errs.length ? errs.slice(0,3) : 'none')
await b.close()
