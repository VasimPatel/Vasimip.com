import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const errs = []
const engineLogs = []
p.on('console', m => {
  const t = m.text()
  if (m.type() === 'error') errs.push(t.slice(0, 160))
  else if (t.startsWith('[engine]') && !t.includes('migration notes')) engineLogs.push(t.slice(9, 150))
})
p.on('pageerror', e => errs.push('page: ' + e.message.slice(0, 160)))
await p.goto('http://localhost:5173/?engine=1', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1000))
const shot = (n) => p.screenshot({ path: `${SP}/j-${n}.png` })
// full ride: keep pressing ArrowRight through every panel + page flip
await p.evaluate(() => window.__notebookGoTo && window.__notebookGoTo(1))
await new Promise(r => setTimeout(r, 2400)); await shot('p1-enter')
for (let i = 0; i < 24; i++) {
  await p.keyboard.press('ArrowRight')
  await new Promise(r => setTimeout(r, 2100))
  const page = await p.evaluate(() => document.querySelector('[data-dash-renderer]') ? 1 : 0)
  if (i === 3) await shot('p2')
  if (i === 8) await shot('p3-work')
  if (i === 12) await shot('p4-skills')
  if (i === 16) await shot('p5-contact')
  void page
}
await shot('end')
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none')
console.log('engine events:', engineLogs.length)
console.log(engineLogs.slice(-14).join('\n'))
await b.close()
