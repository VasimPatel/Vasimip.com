import puppeteer from 'puppeteer-core'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 760, deviceScaleFactor: 3 } })
const p = await b.newPage()
await p.goto('http://localhost:5197/dev/charm.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2500))
// crop the HEADS from both panels: legacy figure and engine figure
const heads = await p.evaluate(() => {
  const legacySvg = document.querySelectorAll('svg')[0]
  const eng = document.querySelector('[data-dash-renderer]')
  const lr = legacySvg.getBoundingClientRect()
  const er = eng.getBoundingClientRect()
  return { l: { x: lr.x, y: lr.y, w: lr.width, h: lr.height }, e: { x: er.x, y: er.y, w: er.width, h: er.height } }
})
await p.screenshot({ path: `${SP}/face-legacy.png`, clip: { x: heads.l.x + heads.l.w * 0.25, y: heads.l.y - 10, width: heads.l.w * 0.55, height: heads.l.h * 0.45 } })
await p.screenshot({ path: `${SP}/face-engine.png`, clip: { x: heads.e.x, y: heads.e.y - 10, width: heads.e.w + 20, height: heads.e.h * 0.5 + 10 } })
console.log('heads', JSON.stringify(heads))
await b.close()
