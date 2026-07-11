// Spike A — verlet SVG perf prototype. Plain JS, one rAF loop, three
// switchable render mechanisms (attr / css / use) for writing per-frame
// transforms to SVG elements. Throwaway code — see spikes/a-verlet-svg for
// the harness that measures it.

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const gDirect = document.getElementById('gDirect');
const gUse = document.getElementById('gUse');
const anchorsG = document.getElementById('anchors');
const hud = document.getElementById('hud');

// ---------------------------------------------------------------------------
// Render mode
// ---------------------------------------------------------------------------
const MODES = ['attr', 'css', 'use'];
let mode = new URLSearchParams(location.search).get('mode');
if (!MODES.includes(mode)) mode = 'attr';

function applyModeVisibility() {
  gDirect.style.display = mode === 'use' ? 'none' : '';
  gUse.style.display = mode === 'use' ? '' : 'none';
}

window.__setRenderMode = function (m) {
  if (!MODES.includes(m)) return false;
  mode = m;
  applyModeVisibility();
  return true;
};

// ---------------------------------------------------------------------------
// Sim constants
// ---------------------------------------------------------------------------
const FIXED_DT = 1 / 120; // 120 Hz simulation
const MAX_SUBSTEPS = 10; // clamp so a stalled tab doesn't spiral
const GRAVITY = 1600; // px/s^2
const DAMPING = 0.985; // verlet velocity retention per substep
const ITER = 4; // constraint relaxation iterations

// ---------------------------------------------------------------------------
// Particle store (shared flat arrays: character [0..14], rope [15..34])
// ---------------------------------------------------------------------------
const N_CHAR = 15;
const N_ROPE = 20;
const N_PARTICLES = N_CHAR + N_ROPE;

const px = new Float64Array(N_PARTICLES); // current x
const py = new Float64Array(N_PARTICLES); // current y
const ppx = new Float64Array(N_PARTICLES); // previous x
const ppy = new Float64Array(N_PARTICLES); // previous y
const invMass = new Float64Array(N_PARTICLES).fill(1);
const invMassNormal = new Float64Array(N_PARTICLES).fill(1); // remembered value to restore after drag

function setParticle(i, x, y, inv) {
  px[i] = x; py[i] = y; ppx[i] = x; ppy[i] = y;
  invMass[i] = inv; invMassNormal[i] = inv;
}

// --- Character layout (15 joints, tree of 14 bones) -------------------------
// indices
const HEAD = 0, NECK = 1, PELVIS = 2;
const L_SH = 3, L_EL = 4, L_HA = 5;
const R_SH = 6, R_EL = 7, R_HA = 8;
const L_HI = 9, L_KN = 10, L_FO = 11;
const R_HI = 12, R_KN = 13, R_FO = 14;

const CHAR_ORIGIN_X = 380, CHAR_ORIGIN_Y = 220; // kept clear of the top-left HUD overlay
setParticle(HEAD, CHAR_ORIGIN_X, CHAR_ORIGIN_Y, 1);
setParticle(NECK, CHAR_ORIGIN_X, CHAR_ORIGIN_Y + 40, 0); // pinned
setParticle(PELVIS, CHAR_ORIGIN_X, CHAR_ORIGIN_Y + 140, 1);
setParticle(L_SH, CHAR_ORIGIN_X - 40, CHAR_ORIGIN_Y + 55, 1);
setParticle(L_EL, CHAR_ORIGIN_X - 75, CHAR_ORIGIN_Y + 100, 1);
setParticle(L_HA, CHAR_ORIGIN_X - 100, CHAR_ORIGIN_Y + 145, 1);
setParticle(R_SH, CHAR_ORIGIN_X + 40, CHAR_ORIGIN_Y + 55, 1);
setParticle(R_EL, CHAR_ORIGIN_X + 75, CHAR_ORIGIN_Y + 100, 1);
setParticle(R_HA, CHAR_ORIGIN_X + 100, CHAR_ORIGIN_Y + 145, 1);
setParticle(L_HI, CHAR_ORIGIN_X - 25, CHAR_ORIGIN_Y + 155, 1);
setParticle(L_KN, CHAR_ORIGIN_X - 30, CHAR_ORIGIN_Y + 230, 1);
setParticle(L_FO, CHAR_ORIGIN_X - 35, CHAR_ORIGIN_Y + 300, 1);
setParticle(R_HI, CHAR_ORIGIN_X + 25, CHAR_ORIGIN_Y + 155, 1);
setParticle(R_KN, CHAR_ORIGIN_X + 30, CHAR_ORIGIN_Y + 230, 1);
setParticle(R_FO, CHAR_ORIGIN_X + 35, CHAR_ORIGIN_Y + 300, 1);

const PINNED_INDEX = NECK; // fixed anchor point; drag targets any *other* joint
const PIN_X = CHAR_ORIGIN_X, PIN_Y = CHAR_ORIGIN_Y + 40;

const boneList = [
  [HEAD, NECK], [NECK, PELVIS],
  [NECK, L_SH], [L_SH, L_EL], [L_EL, L_HA],
  [NECK, R_SH], [R_SH, R_EL], [R_EL, R_HA],
  [PELVIS, L_HI], [L_HI, L_KN], [L_KN, L_FO],
  [PELVIS, R_HI], [R_HI, R_KN], [R_KN, R_FO],
];

// --- Rope layout (20 particles, indices 15..34) -----------------------------
const ROPE_BASE = N_CHAR;
const ROPE_ANCHOR_A = ROPE_BASE, ROPE_ANCHOR_B = ROPE_BASE + N_ROPE - 1;
const ROPE_WEIGHT = ROPE_BASE + Math.floor(N_ROPE / 2);
const ROPE_X0 = 500, ROPE_X1 = 950, ROPE_Y = 160;

for (let i = 0; i < N_ROPE; i++) {
  const t = i / (N_ROPE - 1);
  const idx = ROPE_BASE + i;
  const x = ROPE_X0 + (ROPE_X1 - ROPE_X0) * t;
  const pinned = (i === 0 || i === N_ROPE - 1);
  const heavy = idx === ROPE_WEIGHT;
  setParticle(idx, x, ROPE_Y, pinned ? 0 : (heavy ? 0.35 : 1));
}

const ropeConstraints = [];
{
  const segLen = ((ROPE_X1 - ROPE_X0) / (N_ROPE - 1)) * 1.06; // slight slack -> visible sag
  for (let i = 0; i < N_ROPE - 1; i++) {
    ropeConstraints.push([ROPE_BASE + i, ROPE_BASE + i + 1, segLen]);
  }
}

// --- Combined constraint list [a, b, restLength] ----------------------------
const constraints = [];
function restLen(a, b) {
  return Math.hypot(px[a] - px[b], py[a] - py[b]);
}
for (const [a, b] of boneList) {
  constraints.push([a, b, restLen(a, b)]);
}
for (const c of ropeConstraints) constraints.push(c);

// Physics-only bracing (not rendered as bones): a pure distance-constraint
// tree with no angular stiffness collapses into a limp vertical bundle at
// rest (lowest potential energy for unconstrained joint angles). A shoulder
// bar + hip bar + two torso diagonals keeps the torso from folding flat
// while leaving the arms/legs free to flop — cheap and enough for a spike.
constraints.push([L_SH, R_SH, restLen(L_SH, R_SH)]);
constraints.push([L_HI, R_HI, restLen(L_HI, R_HI)]);
constraints.push([NECK, L_HI, restLen(NECK, L_HI)]);
constraints.push([NECK, R_HI, restLen(NECK, R_HI)]);

// ---------------------------------------------------------------------------
// Props: independent spring-anchored wobblers (not verlet chains)
// ---------------------------------------------------------------------------
const props = [
  { restX: 1180, restY: 300, restRot: 0, size: 34, shape: 'rect' },
  { restX: 1280, restY: 460, restRot: 0, size: 26, shape: 'circ' },
  { restX: 1160, restY: 620, restRot: 0, size: 30, shape: 'rect' },
].map((p) => ({
  ...p,
  x: p.restX, y: p.restY, rot: p.restRot,
  vx: 0, vy: 0, vrot: 0,
}));
const PROP_K = 90; // spring stiffness
const PROP_C = 7.5; // damping

function impulseProp(p) {
  const ang = Math.random() * Math.PI * 2;
  const mag = 260 + Math.random() * 220;
  p.vx += Math.cos(ang) * mag;
  p.vy += Math.sin(ang) * mag - 120;
  p.vrot += (Math.random() - 0.5) * 12;
}

// ---------------------------------------------------------------------------
// DOM element construction — every entity gets a "direct" element (line /
// circle / rect with unit local geometry, transformed via attr or style) AND
// a parallel <use> element referencing shared <defs> geometry. Only the
// active mode's group is visible/written each frame.
// ---------------------------------------------------------------------------
function makeDirect(tag, cls, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  if (cls) el.setAttribute('class', cls);
  // Base local geometry MUST be set explicitly — an SVG <line>/<circle>/<rect>
  // created via createElementNS with no x1/y1/x2/y2 (or cx/cy/r, or x/y/w/h)
  // defaults everything to 0, i.e. a degenerate zero-size shape at the origin.
  // Combined with stroke-linecap:round + a non-uniform scale() transform, a
  // zero-length line renders as a circle that then gets stretched into a huge
  // needle — this was the actual cause of the "star" artifact seen while
  // building this spike; see the stroke-linecap comment in index.html too.
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  gDirect.appendChild(el);
  return el;
}
function makeUse(href, cls) {
  const el = document.createElementNS(SVGNS, 'use');
  el.setAttribute('href', '#' + href);
  el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + href); // Chrome quirk: some paths still want xlink:href
  if (cls) el.setAttribute('class', cls);
  gUse.appendChild(el);
  return el;
}

const UNIT_LINE = { x1: 0, y1: 0, x2: 1, y2: 0 };
const UNIT_CIRCLE = { cx: 0, cy: 0, r: 1 };

// bones: unit line (0,0)-(1,0) scaled to length, rotated to angle
const boneEls = boneList.map(() => ({
  direct: makeDirect('line', 'bone', UNIT_LINE),
  use: makeUse('segGeom', 'bone'),
}));

// joints: unit circle r=1 scaled to radius
const jointEls = [];
for (let i = 0; i < N_CHAR; i++) {
  const cls = i === PINNED_INDEX ? 'joint pinned' : 'joint';
  jointEls.push({ direct: makeDirect('circle', cls, UNIT_CIRCLE), use: makeUse('jointGeom', cls) });
}

// rope segments (same treatment as bones)
const ropeSegEls = ropeConstraints.map(() => ({
  direct: makeDirect('line', 'rope-seg', UNIT_LINE),
  use: makeUse('segGeom', 'rope-seg'),
}));
const ropeWeightEl = { direct: makeDirect('circle', 'rope-weight', UNIT_CIRCLE), use: makeUse('jointGeom', 'rope-weight') };

// static rope anchors (never move, drawn once, not part of the timed loop)
for (const idx of [ROPE_ANCHOR_A, ROPE_ANCHOR_B]) {
  const c = document.createElementNS(SVGNS, 'circle');
  c.setAttribute('class', 'rope-anchor');
  c.setAttribute('cx', px[idx]);
  c.setAttribute('cy', py[idx]);
  c.setAttribute('r', 7);
  anchorsG.appendChild(c);
}

// props
const UNIT_RECT = { x: -1, y: -1, width: 2, height: 2 };
for (const p of props) {
  const geom = p.shape === 'rect' ? 'rectGeom' : 'circGeom';
  const tag = p.shape === 'rect' ? 'rect' : 'circle';
  p.elDirect = makeDirect(tag, 'prop', tag === 'rect' ? UNIT_RECT : UNIT_CIRCLE);
  p.elUse = makeUse(geom, 'prop');
  const onDown = () => impulseProp(p);
  p.elDirect.addEventListener('pointerdown', onDown);
  p.elUse.addEventListener('pointerdown', onDown);
}

applyModeVisibility();

// ---------------------------------------------------------------------------
// Transform writers (this is what writeMs measures)
// ---------------------------------------------------------------------------
function writeSeg(pair, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 0.0001;
  const deg = Math.atan2(dy, dx) * (180 / Math.PI);
  if (mode === 'attr') {
    pair.direct.setAttribute('transform', `translate(${x1} ${y1}) rotate(${deg}) scale(${len} 1)`);
  } else if (mode === 'css') {
    pair.direct.style.transform = `translate(${x1}px, ${y1}px) rotate(${deg}deg) scale(${len}, 1)`;
  } else {
    pair.use.setAttribute('transform', `translate(${x1} ${y1}) rotate(${deg}) scale(${len} 1)`);
  }
}
function writeCircle(pair, x, y, r) {
  if (mode === 'attr') {
    pair.direct.setAttribute('transform', `translate(${x} ${y}) scale(${r})`);
  } else if (mode === 'css') {
    pair.direct.style.transform = `translate(${x}px, ${y}px) scale(${r})`;
  } else {
    pair.use.setAttribute('transform', `translate(${x} ${y}) scale(${r})`);
  }
}
function writeProp(p) {
  const deg = p.rot * (180 / Math.PI); // SVG transform attr rotate() is degrees; p.rot is radians
  if (mode === 'attr') {
    p.elDirect.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${deg}) scale(${p.size})`);
  } else if (mode === 'css') {
    p.elDirect.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}rad) scale(${p.size})`;
  } else {
    p.elUse.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${deg}) scale(${p.size})`);
  }
}

// ---------------------------------------------------------------------------
// Physics step
// ---------------------------------------------------------------------------
function integrateParticles(dt) {
  const g = GRAVITY * dt * dt;
  for (let i = 0; i < N_PARTICLES; i++) {
    if (invMass[i] === 0) { ppx[i] = px[i]; ppy[i] = py[i]; continue; }
    const vx = (px[i] - ppx[i]) * DAMPING;
    const vy = (py[i] - ppy[i]) * DAMPING;
    ppx[i] = px[i]; ppy[i] = py[i];
    px[i] += vx;
    py[i] += vy + g;
  }
  // hold the fixed pin exactly (belt-and-suspenders vs. float drift)
  if (invMass[PINNED_INDEX] === 0 && draggingIndex !== PINNED_INDEX) {
    px[PINNED_INDEX] = PIN_X; py[PINNED_INDEX] = PIN_Y;
  }
}

function satisfyConstraints() {
  for (let iter = 0; iter < ITER; iter++) {
    for (let k = 0; k < constraints.length; k++) {
      const c = constraints[k];
      const a = c[0], b = c[1], rest = c[2];
      let dx = px[b] - px[a], dy = py[b] - py[a];
      let dist = Math.hypot(dx, dy) || 0.0001;
      const diff = (dist - rest) / dist;
      const wa = invMass[a], wb = invMass[b];
      const sum = wa + wb;
      if (sum === 0) continue;
      const corrX = dx * diff, corrY = dy * diff;
      const ratioA = wa / sum, ratioB = wb / sum;
      px[a] += corrX * ratioA; py[a] += corrY * ratioA;
      px[b] -= corrX * ratioB; py[b] -= corrY * ratioB;
    }
  }
}

function stepProps(dt) {
  for (const p of props) {
    const ax = -PROP_K * (p.x - p.restX) - PROP_C * p.vx;
    const ay = -PROP_K * (p.y - p.restY) - PROP_C * p.vy;
    const arot = -PROP_K * (p.rot - p.restRot) - PROP_C * p.vrot;
    p.vx += ax * dt; p.vy += ay * dt; p.vrot += arot * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt;
  }
}

function simStep(dt) {
  integrateParticles(dt);
  satisfyConstraints();
  stepProps(dt);
}

// ---------------------------------------------------------------------------
// Render (write) pass — writes the current particle/prop state to the DOM
// using whichever mode is active. This whole function body is what writeMs
// times.
// ---------------------------------------------------------------------------
function render() {
  for (let i = 0; i < boneList.length; i++) {
    const [a, b] = boneList[i];
    writeSeg(boneEls[i], px[a], py[a], px[b], py[b]);
  }
  for (let i = 0; i < N_CHAR; i++) {
    writeCircle(jointEls[i], px[i], py[i], i === PINNED_INDEX ? 8 : 6);
  }
  for (let i = 0; i < ropeConstraints.length; i++) {
    const [a, b] = ropeConstraints[i];
    writeSeg(ropeSegEls[i], px[a], py[a], px[b], py[b]);
  }
  writeCircle(ropeWeightEl, px[ROPE_WEIGHT], py[ROPE_WEIGHT], 10);
  for (const p of props) writeProp(p);
}

// ---------------------------------------------------------------------------
// Drag interaction (character only; grabs the nearest non-pinned joint)
// ---------------------------------------------------------------------------
let draggingIndex = -1;
const svgPoint = svg.createSVGPoint();

function clientToSvg(clientX, clientY) {
  svgPoint.x = clientX; svgPoint.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = svgPoint.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function nearestCharJoint(x, y, maxDist) {
  let best = -1, bestD = maxDist * maxDist;
  for (let i = 0; i < N_CHAR; i++) {
    if (i === PINNED_INDEX) continue;
    const dx = px[i] - x, dy = py[i] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

svg.addEventListener('pointerdown', (e) => {
  const { x, y } = clientToSvg(e.clientX, e.clientY);
  const idx = nearestCharJoint(x, y, 55);
  if (idx >= 0) {
    draggingIndex = idx;
    invMass[idx] = 0;
    px[idx] = x; py[idx] = y; ppx[idx] = x; ppy[idx] = y;
    svg.setPointerCapture(e.pointerId);
  }
});
svg.addEventListener('pointermove', (e) => {
  if (draggingIndex < 0) return;
  const { x, y } = clientToSvg(e.clientX, e.clientY);
  px[draggingIndex] = x; py[draggingIndex] = y;
  ppx[draggingIndex] = x; ppy[draggingIndex] = y; // zero velocity while held
});
function releaseDrag() {
  if (draggingIndex < 0) return;
  invMass[draggingIndex] = invMassNormal[draggingIndex];
  draggingIndex = -1;
}
svg.addEventListener('pointerup', releaseDrag);
svg.addEventListener('pointercancel', releaseDrag);

// ---------------------------------------------------------------------------
// Agitation — programmatic disturbance so measurements reflect an actively
// moving scene rather than a settled one.
// ---------------------------------------------------------------------------
// Apply a velocity kick to a verlet particle by displacing its *previous*
// position (not the current one) — this is what a real impulse looks like
// under verlet integration (v = pos - prevPos). Directly teleporting `pos`
// instead injects a huge implied velocity (delta / one 1/120s substep) and
// produces an unreadable, over-stretched tangle instead of a believable snap.
function kickParticle(idx, vx, vy) {
  ppx[idx] = px[idx] - vx * FIXED_DT;
  ppy[idx] = py[idx] - vy * FIXED_DT;
}

const AGITATE_TARGETS = [L_HA, R_HA, L_FO, R_FO, HEAD];
window.__spikeAgitate = function () {
  // yank one or two character extremities per pulse (not all limbs at once —
  // kicking every extremity simultaneously with independent random
  // directions produces an unreadable tangle since limbs have no
  // self-collision) with a plausible hand-snap velocity.
  const n = 1 + (Math.random() < 0.5 ? 1 : 0);
  const picked = new Set();
  while (picked.size < n) picked.add(AGITATE_TARGETS[(Math.random() * AGITATE_TARGETS.length) | 0]);
  for (const idx of picked) {
    const vx = (Math.random() - 0.5) * 700;
    const vy = (Math.random() - 0.5) * 500 - 250;
    kickParticle(idx, vx, vy);
  }
  // pluck the rope weight
  kickParticle(ROPE_WEIGHT, (Math.random() - 0.5) * 500, -700 - Math.random() * 300);
  // impulse every prop
  for (const p of props) impulseProp(p);
  return true;
};

// ---------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------
let simSamples = [];
let writeSamples = [];
let frameCount = 0;
let windowStart = performance.now();

window.__spikeReset = function () {
  simSamples = [];
  writeSamples = [];
  frameCount = 0;
  windowStart = performance.now();
  return true;
};

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
function avg(arr) {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

window.__spikeStats = function () {
  const elapsed = (performance.now() - windowStart) / 1000;
  const fps = elapsed > 0 ? frameCount / elapsed : 0;
  const simSorted = simSamples.slice().sort((a, b) => a - b);
  const writeSorted = writeSamples.slice().sort((a, b) => a - b);
  return {
    mode,
    frames: frameCount,
    fps: Number(fps.toFixed(2)),
    simMsAvg: Number(avg(simSamples).toFixed(4)),
    simMsP95: Number(pct(simSorted, 0.95).toFixed(4)),
    writeMsAvg: Number(avg(writeSamples).toFixed(4)),
    writeMsP95: Number(pct(writeSorted, 0.95).toFixed(4)),
  };
};

// ---------------------------------------------------------------------------
// Main loop — fixed-timestep accumulator for sim, render every rAF.
// ---------------------------------------------------------------------------
let last = performance.now();
let accumulator = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // clamp huge gaps (tab backgrounded etc.)
  accumulator += dt;

  const simStart = performance.now();
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    simStep(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  const simMs = performance.now() - simStart;

  const writeStart = performance.now();
  render();
  const writeMs = performance.now() - writeStart;

  simSamples.push(simMs);
  writeSamples.push(writeMs);
  frameCount++;

  if (frameCount % 15 === 0) {
    const s = window.__spikeStats();
    hud.textContent =
      `mode: ${mode}\n` +
      `fps: ${s.fps.toFixed(1)}  frames: ${s.frames}\n` +
      `sim  avg/p95: ${s.simMsAvg.toFixed(3)} / ${s.simMsP95.toFixed(3)} ms\n` +
      `write avg/p95: ${s.writeMsAvg.toFixed(3)} / ${s.writeMsP95.toFixed(3)} ms\n` +
      `drag a joint, click a prop, ?mode=attr|css|use`;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// kick off with a bit of motion so the scene isn't dead on load
window.__spikeAgitate();
