// Headless gate for Spike B. Loads the page, measures the "pop" metric
// (max single-tick change in per-joint angular velocity) across three regimes:
//   (a) 5 s idle: only breathing + verlet settle -> must not vibrate.
//   (b) normal eased crossfades.
//   (c) stress mid-transition retargets (the classic pop case).
// PASS if stress velocity-jump < 2x the normal-crossfade velocity-jump, i.e.
// interrupting a transition is no worse than ~2x a clean one. Rationale: a truly
// velocity-continuous blend (SmoothDamp) carries velocity through the retarget,
// so the interrupt should cost ~1x; 2x is a generous ceiling that still fails a
// hard positional pop (which spikes 5-20x). Idle must stay near-zero jump and
// have a low sign-flip rate (no frame-frequency jitter).
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5198';
const OUT = process.argv[3] ||
  '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=900,700'],
  defaultViewport: { width: 900, height: 700 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate(() => window.__setMode('smoothdamp'));

const reset = () => page.evaluate(() => window.__blendReset());
const stats = () => page.evaluate(() => window.__blendStats());

// ---- (a) idle jitter: no crossfade, breathing + verlet only ----------------
await page.evaluate(() => { window.__autoBlend(false); window.__blendTo('stand', 400); });
await sleep(1200);              // let it settle into pure idle
await reset();
await sleep(5000);
const idle = await stats();
await page.screenshot({ path: `${OUT}/spikeB-idle.png` });

// ---- (b) 3 normal crossfades ----------------------------------------------
await reset();
const names = ['cheer', 'stand', 'cheer'];
let midShot = false;
for (const n of names) {
  await page.evaluate((nm) => window.__blendTo(nm, 650), n);
  if (!midShot) { await sleep(280); await page.screenshot({ path: `${OUT}/spikeB-midcrossfade.png` }); midShot = true; await sleep(720); }
  else { await sleep(1000); }
}
await sleep(400);
const normal = await stats();

// ---- (c) 3 stress mid-transition retargets ---------------------------------
await reset();
let stressShot = false;
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.__blendStress()); // A->B, retarget to A at 300ms
  if (!stressShot) { await sleep(360); await page.screenshot({ path: `${OUT}/spikeB-stress.png` }); stressShot = true; await sleep(1140); }
  else { await sleep(1500); }
}
const stress = await stats();

// ---- verdict ---------------------------------------------------------------
const idleJump = idle.maxVelocityJumpDegPerTick;
const idleFlip = idle.maxSignFlipRate;
const normalJump = normal.maxVelocityJumpDegPerTick;
const stressJump = stress.maxVelocityJumpDegPerTick;
const ratio = normalJump > 1e-6 ? stressJump / normalJump : Infinity;

const IDLE_JUMP_MAX = 0.5;     // deg/tick: idle accel spikes must be tiny
const IDLE_FLIP_MAX = 0.10;    // <=10% of ticks flip sign -> smooth, not vibrating
const STRESS_RATIO_MAX = 2.0;

const pass =
  idleJump < IDLE_JUMP_MAX &&
  idleFlip < IDLE_FLIP_MAX &&
  ratio < STRESS_RATIO_MAX;

const results = {
  mode: 'smoothdamp',
  thresholds: { IDLE_JUMP_MAX, IDLE_FLIP_MAX, STRESS_RATIO_MAX },
  idle: { maxVelocityJumpDegPerTick: idleJump, maxSignFlipRate: idleFlip, peakVelocityDegPerTick: idle.peakVelocityDegPerTick },
  normalCrossfade: { maxVelocityJumpDegPerTick: normalJump, peakVelocityDegPerTick: normal.peakVelocityDegPerTick },
  stressRetarget: { maxVelocityJumpDegPerTick: stressJump, peakVelocityDegPerTick: stress.peakVelocityDegPerTick },
  stressToNormalRatio: +ratio.toFixed(3),
  PASS: pass,
  errors,
};
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
process.exit(pass ? 0 : 1);
