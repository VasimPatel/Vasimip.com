// Spike A measurement harness — modeled on scripts/shoot.mjs.
// Usage: node spikes/a-verlet-svg/measure.mjs [baseURL] [outDir]
//
// For each render mode (attr / css / use), loads the page, throttles the
// CPU 4x via CDP, agitates the scene, lets it run, samples __spikeStats(),
// and also takes one unthrottled reference run. Screenshots are taken
// mid-agitation for each mode. Writes spikes/a-verlet-svg/results.json.

import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:5199';
const OUT_DIR = process.argv[3] || '/private/tmp/claude-501/-Users-vasimpatel-Projects-Vasimip-com/32aa8dcf-c680-4ebe-b81e-26481170ef2d/scratchpad';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODES = ['attr', 'css', 'use'];
const RUN_MS = 8000;
const AGITATE_EVERY_MS = 2000;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});

async function runOnce(mode, { throttled, screenshot }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${BASE}/?mode=${mode}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(300);

  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttled ? 4 : 1 });

  await page.evaluate(() => { window.__spikeAgitate(); window.__spikeReset(); });

  let elapsed = 0;
  while (elapsed < RUN_MS) {
    await sleep(AGITATE_EVERY_MS);
    elapsed += AGITATE_EVERY_MS;
    await page.evaluate(() => window.__spikeAgitate());
    if (screenshot && elapsed === AGITATE_EVERY_MS * 2) {
      // grab a screenshot ~350ms after the 2nd pulse so motion reads as an
      // in-flight swing/wobble rather than the exact instant of impulse
      await sleep(500);
      await page.screenshot({ path: path.join(OUT_DIR, `spikeA-${mode}.png`) });
    }
  }

  const stats = await page.evaluate(() => window.__spikeStats());
  await page.close();
  return { stats, errors };
}

const results = { throttled4x: {}, unthrottled: {}, errors: {} };

for (const mode of MODES) {
  console.log(`\n=== mode: ${mode} ===`);

  console.log('  throttled (4x)…');
  const t = await runOnce(mode, { throttled: true, screenshot: true });
  results.throttled4x[mode] = t.stats;
  if (t.errors.length) results.errors[`${mode}-throttled`] = t.errors;
  console.log('   ', t.stats);

  console.log('  unthrottled (1x)…');
  const u = await runOnce(mode, { throttled: false, screenshot: false });
  results.unthrottled[mode] = u.stats;
  if (u.errors.length) results.errors[`${mode}-unthrottled`] = u.errors;
  console.log('   ', u.stats);
}

await browser.close();

function printTable(title, rows) {
  console.log(`\n${title}`);
  const header = ['mode', 'fps', 'simMsAvg', 'simMsP95', 'writeMsAvg', 'writeMsP95'];
  const lines = [header, ...MODES.map((m) => {
    const s = rows[m];
    return [m, s.fps, s.simMsAvg, s.simMsP95, s.writeMsAvg, s.writeMsP95];
  })];
  const widths = header.map((_, c) => Math.max(...lines.map((l) => String(l[c]).length)));
  for (const l of lines) {
    console.log(l.map((v, c) => String(v).padEnd(widths[c])).join('  |  '));
  }
}

printTable('THROTTLED 4x', results.throttled4x);
printTable('UNTHROTTLED 1x', results.unthrottled);

if (Object.keys(results.errors).length) {
  console.log('\nERRORS:');
  for (const [k, v] of Object.entries(results.errors)) {
    console.log(` ${k}:`, v);
  }
} else {
  console.log('\nno console/page errors captured');
}

const outFile = path.join(__dirname, 'results.json');
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nresults written -> ${outFile}`);
console.log(`screenshots -> ${OUT_DIR}/spikeA-<mode>.png`);
