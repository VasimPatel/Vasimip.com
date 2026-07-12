import puppeteer from 'puppeteer-core'
const SP = process.argv[2]
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 760 } })
const page = await browser.newPage()
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', e => errs.push(e.message))
await page.goto('http://localhost:5197/charm.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2500))
await page.screenshot({ path: `${SP}/charm-idle.png` })
// stroll mid-stride
const btns = await page.$$('button')
await btns[0].click(); await new Promise(r => setTimeout(r, 1600))
await page.screenshot({ path: `${SP}/charm-stroll.png` })
// hop: catch mid-air then landing
await btns[4].click(); await new Promise(r => setTimeout(r, 600))
await btns[1].click(); await new Promise(r => setTimeout(r, 520))
await page.screenshot({ path: `${SP}/charm-hop-air.png` })
await new Promise(r => setTimeout(r, 300))
await page.screenshot({ path: `${SP}/charm-hop-land.png` })
// say
await btns[2].click(); await new Promise(r => setTimeout(r, 700))
await page.screenshot({ path: `${SP}/charm-say.png` })
// poke
await btns[3].click(); await new Promise(r => setTimeout(r, 250))
await page.screenshot({ path: `${SP}/charm-poke.png` })
console.log('errors:', errs.length ? errs.slice(0,5) : 'none')
await browser.close()
