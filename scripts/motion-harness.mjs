// Q0 motion harness — records per-frame motion (the EngineLayer recorder +
// DOM sampling on legacy), computes MOTION-QUALITY metrics (not frame delivery),
// and captures screencast flipbooks for 0.25× owner review.
//
// Metrics per engine run:
//   bobHz        — dominant frequency of skinY oscillation while ground-moving
//   stepScore    — zero/double-step alternation in screen-space velocity (0=smooth)
//   sockSep      — cape root distance from the neck socket (avg / p95 / max)
//   camSaw       — camera-target update sawtooth (target jumps per second)
//   speed        — mean |dx/dt| of the root while ground-moving (px/s)
//
// Usage:
//   node scripts/motion-harness.mjs <outDir> [baseURL] [scenario ...]
//   node scripts/motion-harness.mjs <outDir> [baseURL] --negative-control
//   flags: --throttle=4  --no-clips
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = process.argv[2]
if (!OUT) {
  console.error('usage: node scripts/motion-harness.mjs <outDir> [baseURL] [scenario ...| --negative-control] [--throttle=N] [--no-clips]')
  process.exit(2)
}
const BASE = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://localhost:5178'
const rest = process.argv.slice(process.argv[3]?.startsWith('http') ? 4 : 3)
const NEGATIVE = rest.includes('--negative-control')
const NO_CLIPS = rest.includes('--no-clips')
const throttleArg = rest.find((a) => a.startsWith('--throttle='))
const THROTTLE = throttleArg ? Number(throttleArg.split('=')[1]) : 1
const ONLY = rest.filter((a) => !a.startsWith('--'))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// scenarios: page + drive + how long to record. All force determinism.
const SCENARIOS = {
  // entrance strolls are the guaranteed PURE ground walks (panel-to-panel travel
  // usually jumps); the drive flips forward and the recorder catches the stroll.
  'walk-entrance': { page: 2, ms: 5500, force: { 'walk.trip': false }, recordFromDrive: true, drive: (p) => p.evaluate(() => window.__notebookGoTo(3)) },
  'walk-med': { page: 3, ms: 6000, force: { 'walk.trip': false }, drive: (p) => p.evaluate(() => window.__notebookRunBuiltin('walk')) },
  'approach-vault': { page: 3, ms: 6000, force: { 'vault.peek': false }, drive: (p) => p.evaluate(() => window.__notebookRunBuiltin('vault')) },
  'walk-to-land': { page: 4, ms: 6000, force: { 'walk.trip': false }, recordFromDrive: true, drive: (p) => p.evaluate(() => window.__notebookGoTo(5)) },
  'fight-loop': { page: 2, ms: 5500, force: {}, drive: async () => {} },
  poof: { page: 3, ms: 4000, force: {}, drive: (p) => p.evaluate(() => window.__notebookRunBuiltin('poof')) },
  'bomb-back': { page: 3, ms: 7000, force: { 'backnav.bomb': true }, drive: (p) => p.keyboard.press('ArrowLeft') },
  poke: {
    page: 2, ms: 3000, force: { 'poke.arc': 'spin', 'poke.line': 0 },
    drive: async (p) => {
      const at = await p.evaluate(() => {
        const el = document.querySelector('[data-dash-poke]') || document.querySelector('[data-dash-actor]')
        const r = el?.getBoundingClientRect()
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
      })
      if (at && at.x > 0 && at.x < 1440) {
        await p.mouse.move(at.x, at.y)
        await p.mouse.down()
        await p.mouse.up()
      }
    },
  },
  'drag-cycle': {
    page: 2, ms: 5000, force: { 'drop.line': 0 },
    drive: async (p) => {
      const at = await p.evaluate(() => {
        const el = document.querySelector('[data-dash-poke]') || document.querySelector('[data-dash-actor]')
        const r = el?.getBoundingClientRect()
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
      })
      if (!at) return
      await p.mouse.move(at.x, at.y)
      await p.mouse.down()
      for (let i = 1; i <= 12; i++) await p.mouse.move(at.x + i * 10, at.y - i * 6)
      await sleep(500)
      await p.mouse.up()
    },
  },
  'source-cut': {
    // abrupt source change while the cape has velocity: walk then poke mid-stride
    page: 3, ms: 5000, force: { 'walk.trip': false, 'poke.arc': 'wob', 'poke.line': 0 },
    drive: async (p) => {
      await p.evaluate(() => window.__notebookRunBuiltin('walk'))
      await sleep(1200)
      await p.evaluate(() => {
        const el = document.querySelector('[data-dash-poke]')
        for (const type of ['mousedown', 'mouseup', 'click']) el?.dispatchEvent(new MouseEvent(type, { bubbles: true }))
      })
    },
  },
}

// ── metrics ──────────────────────────────────────────────────────────────────
function median(a) {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
function quantile(a, q) {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN
}

/** Dominant oscillation frequency (Hz) of series y over times t (zero-crossing count). */
function dominantHz(y, t) {
  if (y.length < 8) return 0
  const mean = y.reduce((a, b) => a + b, 0) / y.length
  let crossings = 0
  for (let i = 1; i < y.length; i++) {
    if ((y[i - 1] - mean) * (y[i] - mean) < 0) crossings++
  }
  const seconds = (t[t.length - 1] - t[0]) / 1000
  return seconds > 0 ? crossings / 2 / seconds : 0
}

function metrics(samples) {
  // ground-moving segments: |dx| meaningful and same source id streak
  const moving = []
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t
    if (dt <= 0 || dt > 80) continue
    if (samples[i].air || samples[i - 1].air) continue // ground metrics only
    const vx = ((samples[i].rootX - samples[i - 1].rootX) / dt) * 1000
    if (Math.abs(vx) > 20) moving.push(i)
  }
  const bobY = moving.map((i) => samples[i].skinY)
  const bobT = moving.map((i) => samples[i].t)
  // robust amplitude: p95−p5 ignores single mode-boundary samples (the first/
  // last frame of a walk flips between support-line and capsule anchoring).
  const bobAmp = bobY.length ? (quantile(bobY, 0.95) - quantile(bobY, 0.05)) / 2 : 0
  const bobHz = dominantHz(bobY, bobT)

  // screen-space step pattern: normalized |d(scr)/frame| — alternation score =
  // fraction of frames where displacement flips between ~0 and ~2× median.
  const disp = []
  for (let i = 1; i < samples.length; i++) {
    if (Number.isNaN(samples[i].scrX) || Number.isNaN(samples[i - 1].scrX)) continue
    disp.push(Math.hypot(samples[i].scrX - samples[i - 1].scrX, samples[i].scrY - samples[i - 1].scrY))
  }
  const activeDisp = disp.filter((d) => d > 0.05)
  const m = median(activeDisp)
  let flips = 0
  for (let i = 1; i < activeDisp.length; i++) {
    const lo = activeDisp[i - 1] < 0.4 * m
    const hi = activeDisp[i] > 1.6 * m
    if ((lo && hi) || (activeDisp[i - 1] > 1.6 * m && activeDisp[i] < 0.4 * m)) flips++
  }
  const stepScore = activeDisp.length > 4 ? flips / activeDisp.length : 0

  // cape socket separation
  const sep = samples
    .filter((s) => !Number.isNaN(s.sockX) && !Number.isNaN(s.capeRootX))
    .map((s) => Math.hypot(s.capeRootX - s.sockX, s.capeRootY - s.sockY))

  // camera target updates per second (the follow sawtooth)
  let camJumps = 0
  for (let i = 1; i < samples.length; i++) {
    if (Number.isNaN(samples[i].camX) || Number.isNaN(samples[i - 1].camX)) continue
    if (Math.hypot(samples[i].camX - samples[i - 1].camX, samples[i].camY - samples[i - 1].camY) > 0.5) camJumps++
  }
  const seconds = samples.length ? (samples[samples.length - 1].t - samples[0].t) / 1000 : 1

  // ground speed
  const speeds = moving.map((i) => {
    const dt = samples[i].t - samples[i - 1].t
    return Math.abs(((samples[i].rootX - samples[i - 1].rootX) / dt) * 1000)
  })

  return {
    frames: samples.length,
    bobHz: +bobHz.toFixed(2),
    bobAmp: +bobAmp.toFixed(2),
    stepScore: +stepScore.toFixed(3),
    sockSepAvg: +(sep.reduce((a, b) => a + b, 0) / (sep.length || 1)).toFixed(2),
    sockSepP95: +quantile(sep, 0.95).toFixed(2),
    sockSepMax: +(sep.length ? Math.max(...sep) : 0).toFixed(2),
    camUpdatesPerSec: +(camJumps / seconds).toFixed(2),
    groundSpeedMed: +median(speeds).toFixed(1),
  }
}

// ── runner ───────────────────────────────────────────────────────────────────
async function runScenario(browser, name, spec, extraForce = {}) {
  const dir = `${OUT}/${name}`
  mkdirSync(dir, { recursive: true })
  const p = await browser.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  p.on('console', (m) => {
    if (m.type() !== 'error') return
    if ((m.location()?.url ?? '').includes('/api/')) return
    errors.push('console.error: ' + m.text())
  })
  const cdp = await p.createCDPSession()
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await p.setViewport({ width: 1440, height: 900 })
  await p.evaluateOnNewDocument((f) => {
    window.__dashReview = { seed: 7, motion: true, force: { 'fidget.delayMs': 99999, 'flourish.roll': false, 'flip.surf': false, ...f }, log: [] }
  }, { ...spec.force, ...extraForce })
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 })
  await sleep(500)
  await p.evaluate((pg) => window.__notebookGoTo(pg), spec.page)
  await sleep(1200)
  for (let w = 0; w < 60; w++) {
    if (!(await p.evaluate(() => window.__notebookBusy?.() ?? false))) break
    await sleep(250)
  }
  await p.evaluate(() => {
    window.__dashMotion = []
  })

  // screencast flipbook (0.25× playback = frame delay ×4)
  const clipFrames = []
  if (!NO_CLIPS) {
    cdp.on('Page.screencastFrame', async (ev) => {
      clipFrames.push(ev.data)
      try {
        await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId })
      } catch {
        /* ended */
      }
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 720, maxHeight: 450, everyNthFrame: 2 })
  }

  await spec.drive(p)
  await sleep(spec.ms)

  if (!NO_CLIPS) {
    try {
      await cdp.send('Page.stopScreencast')
    } catch {
      /* ok */
    }
  }
  const samples = await p.evaluate(() => window.__dashMotion ?? [])
  await p.close()

  writeFileSync(`${dir}/motion.json`, JSON.stringify(samples))
  const met = metrics(samples)
  writeFileSync(`${dir}/metrics.json`, JSON.stringify(met, null, 2))
  if (!NO_CLIPS && clipFrames.length > 0) {
    // self-contained flipbook that plays at 0.25× (and 1×) — the owner artifact.
    const html = `<!doctype html><meta charset="utf-8"><title>${name} clip</title>
<style>body{background:#222;color:#eee;font:14px system-ui;margin:12px}img{max-width:100%;border:1px solid #555}</style>
<div><button onclick="setRate(0.25)">0.25×</button><button onclick="setRate(1)">1×</button> <span id="s"></span></div>
<img id="f"><script>
const frames=${JSON.stringify(clipFrames)};let i=0,rate=0.25;const el=document.getElementById('f'),st=document.getElementById('s');
function setRate(r){rate=r}
function tick(){el.src='data:image/jpeg;base64,'+frames[i];st.textContent=(i+1)+'/'+frames.length+' @'+rate+'×';i=(i+1)%frames.length;setTimeout(tick,(1000/30)/rate)}
tick()</script>`
    writeFileSync(`${dir}/clip.html`, html)
  }
  return { met, errors, frames: clipFrames.length }
}

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
})

if (NEGATIVE) {
  // The metrics must FLAG injected defects (and stay quiet on the clean run).
  const clean = await runScenario(browser, 'negctl-clean', SCENARIOS['walk-entrance'])
  const step = await runScenario(browser, 'negctl-step', SCENARIOS['walk-entrance'], { 'negctl.step': true })
  const sock = await runScenario(browser, 'negctl-sock', SCENARIOS['walk-entrance'], { 'negctl.socket': true })
  await browser.close()
  console.log('clean:', JSON.stringify(clean.met))
  console.log('step :', JSON.stringify(step.met))
  console.log('sock :', JSON.stringify(sock.met))
  const stepCaught = step.met.bobAmp > clean.met.bobAmp + 2 || step.met.stepScore > clean.met.stepScore + 0.03
  const sockCaught = sock.met.sockSepAvg > clean.met.sockSepAvg + 4
  if (!stepCaught || !sockCaught) {
    console.error(`NEGATIVE CONTROL FAILED: step=${stepCaught} sock=${sockCaught}`)
    process.exit(1)
  }
  console.log('negative controls OK: injected stepping and socket displacement both detected')
  process.exit(0)
}

const names = ONLY.length > 0 ? ONLY : Object.keys(SCENARIOS)
const summary = {}
const allErrors = []
for (const name of names) {
  const spec = SCENARIOS[name]
  if (!spec) {
    console.error('unknown scenario: ' + name)
    continue
  }
  const r = await runScenario(browser, name, spec)
  summary[name] = r.met
  allErrors.push(...r.errors.map((e) => `${name}: ${e}`))
  console.log(`${name}: ${JSON.stringify(r.met)}`)
}
await browser.close()
writeFileSync(`${OUT}/summary.json`, JSON.stringify({ throttle: THROTTLE, summary, errors: allErrors }, null, 2))
if (allErrors.length) {
  allErrors.slice(0, 10).forEach((e) => console.error(' - ' + e))
  process.exit(1)
}
console.log('motion harness done →', OUT)
