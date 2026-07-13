// Parity strips: legacy vs engine, same journey, cropped around Dash.
// Usage: node shoot-parity.mjs <outPrefix>
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const PREFIX = process.argv[2] || 'base'
const SP = '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad/parity'
mkdirSync(SP, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 },
})

async function dashBox(p, mode) {
  return p.evaluate((m) => {
    const el = m === 'legacy'
      ? document.querySelector('[data-dash-actor]')
      : document.querySelector('[data-dash-renderer]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }, mode)
}

async function cropShot(p, mode, name) {
  const r = await dashBox(p, mode)
  if (!r) { console.log('no dash for', mode, name); return }
  const pad = 90
  const clip = {
    x: Math.max(0, r.x + r.w / 2 - pad), y: Math.max(0, r.y + r.h / 2 - pad),
    width: pad * 2, height: pad * 2,
  }
  await p.screenshot({ path: `${SP}/${PREFIX}-${mode}-${name}.png`, clip })
}

async function journey(mode) {
  const p = await b.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)))
  await p.goto(mode === 'legacy' ? 'http://localhost:5173/legacy' : 'http://localhost:5173/', { waitUntil: 'networkidle2' })
  await sleep(800)
  await p.evaluate(() => window.__notebookGoTo(1))
  await sleep(5200)

  // idle closeup (with cursor near Dash for look-at/dilation/lean)
  const r0 = await dashBox(p, mode)
  if (r0) await p.mouse.move(r0.x + r0.w / 2 + 60, r0.y + r0.h / 2 - 20)
  await sleep(700)
  await cropShot(p, mode, 'idle-near')
  // cursor far
  await p.mouse.move(100, 100)
  await sleep(700)
  await cropShot(p, mode, 'idle-far')

  // idle liveliness strip: 10 frames over 9s (fidgets happen 2.8-6s apart)
  for (let i = 0; i < 10; i++) { await cropShot(p, mode, `idlestrip-${String(i).padStart(2, '0')}`); await sleep(900) }

  // hop travel strip: run builtin hop, capture every 90ms
  await p.evaluate(() => window.__notebookRunBuiltin('hop'))
  for (let i = 0; i < 16; i++) { await cropShot(p, mode, `hop-${String(i).padStart(2, '0')}`); await sleep(90) }
  await sleep(2500)

  // poke strip
  const r1 = await dashBox(p, mode)
  if (r1) {
    await p.mouse.move(r1.x + r1.w / 2, r1.y + r1.h / 2)
    await p.mouse.down(); await p.mouse.up()
  }
  for (let i = 0; i < 8; i++) { await cropShot(p, mode, `poke-${String(i).padStart(2, '0')}`); await sleep(100) }

  console.log(mode, 'errors:', errs.length ? errs : 'none')
  await p.close()
}

await journey('legacy')
await journey('engine')
await b.close()
console.log('strips →', SP, 'prefix', PREFIX)
