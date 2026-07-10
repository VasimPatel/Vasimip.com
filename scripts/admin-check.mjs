// Headless e2e for the dev admin portal.
// Usage: node scripts/admin-check.mjs [baseURL]   (dev server assumed running)
// Opens /admin, drags the first panel +32/+16, Saves, verifies notebook.json on
// disk moved by exactly that, then drags back and Saves again so the repo is left
// untouched. Prints PASS/FAIL lines + any console errors.
import puppeteer from 'puppeteer-core'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] || 'http://localhost:5182'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DOC = fileURLToPath(new URL('../src/notebook/notebook.json', import.meta.url))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const pass = (m) => { results.push(true); console.log('PASS ' + m) }
const fail = (m) => { results.push(false); console.log('FAIL ' + m) }

async function readPanel0() {
  const doc = JSON.parse(await readFile(DOC, 'utf8'))
  return doc.pages[0].panels[0]
}
async function waitPanel0(pred, ms = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const p = await readPanel0()
    if (pred(p)) return p
    await sleep(150)
  }
  return null
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1600,1000'],
  defaultViewport: { width: 1600, height: 1000 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
// beforeunload confirm dialogs (HMR reload after save) — auto-accept.
page.on('dialog', (d) => d.accept().catch(() => {}))

// Snapshot the exact committed bytes. The middleware writes canonical
// JSON.stringify(doc, null, 2), which reflows the hand-authored (compact)
// notebook.json even for an unchanged doc — so after verifying behavior we
// rewrite the original bytes to leave the repo byte-identical.
const origText = await readFile(DOC, 'utf8')
const orig = await readPanel0()
console.log(`start: panel0 x=${orig.x} y=${orig.y} w=${orig.w}`)

async function ready() {
  await page.waitForSelector('[data-testid="panel-rect-0"]', { timeout: 20000 })
  await sleep(400)
}

// Live (in-memory draft) geometry of panel 0, read from the overlay rect's
// inline style (stage-space px, before the fit scale).
async function liveGeom() {
  return page.$eval('[data-testid="panel-rect-0"]', (el) => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    w: parseFloat(el.style.width),
  }))
}

async function nudge(key, n) {
  for (let k = 0; k < n; k++) await page.keyboard.press(key)
}

// Drag panel-rect-0 toward (targetX,targetY) in stage px (Alt = no snap), then
// correct any sub-pixel residual with exact 1px arrow-key nudges so we land on
// the integer target deterministically.
async function dragTo(targetX, targetY) {
  const before = await liveGeom()
  const box = await page.$eval('[data-testid="panel-rect-0"]', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const scale = box.w / before.w // screen px per stage px
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  await page.keyboard.down('Alt')
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + (targetX - before.x) * scale, cy + (targetY - before.y) * scale, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  // Correct residual via keyboard nudges (panel already selected + focused).
  const after = await liveGeom()
  const dx = targetX - after.x
  const dy = targetY - after.y
  await nudge(dx >= 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(dx))
  await nudge(dy >= 0 ? 'ArrowDown' : 'ArrowUp', Math.abs(dy))
}

async function clickSave() {
  await page.click('[data-testid="save-btn"]')
}

try {
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 30000 })
  await ready()

  // 1) drag +32 / +16, save, expect disk to reflect it exactly.
  await dragTo(orig.x + 32, orig.y + 16)
  await clickSave()
  const moved = await waitPanel0((p) => p.x === orig.x + 32 && p.y === orig.y + 16)
  if (moved) pass(`panel moved on disk to x=${moved.x} y=${moved.y}`)
  else { const p = await readPanel0(); fail(`panel did not move as expected (disk x=${p.x} y=${p.y})`) }

  // 1b) the anchor offset must have ridden along unchanged (that's the fix).
  if (moved && moved.anchor.dx === orig.anchor.dx && moved.anchor.dy === orig.anchor.dy) {
    pass(`anchor offset unchanged after move (dx=${moved.anchor.dx} dy=${moved.anchor.dy})`)
  } else {
    fail(`anchor offset drifted (orig dx=${orig.anchor.dx} dy=${orig.anchor.dy}, now dx=${moved?.anchor.dx} dy=${moved?.anchor.dy})`)
  }

  // 2) restore: reload (HMR fired after save), drag back, save, expect original.
  await sleep(600)
  await ready()
  await dragTo(orig.x, orig.y)
  await clickSave()
  const back = await waitPanel0((p) => p.x === orig.x && p.y === orig.y)
  if (back) pass('panel restored on disk — repo left unchanged')
  else { const p = await readPanel0(); fail(`panel not restored (disk x=${p.x} y=${p.y})`) }

  // 3) GET /__notebook roundtrips to a valid doc.
  const rt = await page.evaluate(async () => {
    const r = await fetch('/__notebook')
    const j = await r.json()
    return { version: j.version, pages: Array.isArray(j.pages) ? j.pages.length : -1 }
  })
  if (rt.version === 1 && rt.pages > 0) pass(`GET /__notebook roundtrips (version ${rt.version}, ${rt.pages} pages)`)
  else fail('GET /__notebook did not roundtrip: ' + JSON.stringify(rt))
} catch (e) {
  fail('threw: ' + (e && e.message ? e.message : String(e)))
} finally {
  await browser.close()
  // Restore the original committed bytes (undo canonical-JSON reflow).
  await writeFile(DOC, origText, 'utf8')
}

if (errors.length) { console.log('\nconsole/page errors (' + errors.length + '):'); errors.forEach((e) => console.log(' - ' + e)) }
else console.log('\nno console/page errors captured')

const ok = results.length > 0 && results.every(Boolean)
console.log('\n' + (ok ? 'ALL PASS' : 'FAILURES PRESENT'))
process.exit(ok ? 0 : 1)
