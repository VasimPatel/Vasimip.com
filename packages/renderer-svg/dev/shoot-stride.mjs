import puppeteer from 'puppeteer-core'
import { execSync } from 'node:child_process'
const SP = process.argv[2]
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 760 } })
const page = await browser.newPage()
await page.goto('http://localhost:5197/charm.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))
const btns = await page.$$('button')
await btns[0].click() // stroll
await new Promise(r => setTimeout(r, 900)) // into steady stride
// 10 frames ~70ms apart ≈ 0.7s ≈ one stride cycle at cadence
const files = []
for (let i = 0; i < 10; i++) {
  const f = `${SP}/stride-${String(i).padStart(2, '0')}.png`
  await page.screenshot({ path: f, clip: { x: 620, y: 220, width: 420, height: 260 } })
  files.push(f)
  await new Promise(r => setTimeout(r, 70))
}
await browser.close()
// montage into one strip via sips-less approach: just list; orchestrator views individually
console.log('frames captured')
