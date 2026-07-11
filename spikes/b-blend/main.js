// Spike B — Dash Engine v2, Phase 0.
// THROWAWAY prototype proving the per-frame layer composition order:
//   L1 base-pose blend  ->  L2 additive procedural  ->  L3 verlet secondary  -> render interp.
// Plain JS, one rAF loop, 120 Hz fixed-timestep accumulator with render interpolation.

// ----------------------------------------------------------------------------
// math helpers
// ----------------------------------------------------------------------------
const PI = Math.PI;
const DEG = 180 / PI;
// wrap to [-PI, PI] -- the shortest-arc primitive used everywhere angles subtract.
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Critically-damped SmoothDamp (Game Programming Gems 4 / Unity Mathf.SmoothDamp),
// angle-aware via shortest arc. Integrates a persistent velocity `vr.v`, so changing
// the target mid-flight (retarget) carries velocity through -> velocity-continuous.
function smoothDampAngle(cur, target, vr, smoothTime, dt) {
  smoothTime = Math.max(1e-4, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = wrapPi(cur - target);
  const targetAdj = cur - change;
  const temp = (vr.v + omega * change) * dt;
  vr.v = (vr.v - omega * temp) * exp;
  return targetAdj + (change + temp) * exp;
}
function smoothDamp(cur, target, vr, smoothTime, dt) {
  smoothTime = Math.max(1e-4, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const targetAdj = cur - change;
  const temp = (vr.v + omega * change) * dt;
  vr.v = (vr.v - omega * temp) * exp;
  return targetAdj + (change + temp) * exp;
}

// ----------------------------------------------------------------------------
// skeleton (13 joints). Angles are LOCAL (relative to parent world angle).
// Screen coords are y-down: worldAngle 0 = +x (right), -PI/2 = up, +PI/2 = down.
// ----------------------------------------------------------------------------
const JOINTS = [
  { id: 'pelvis', parent: null,     len: 46 },
  { id: 'spine',  parent: 'pelvis', len: 34 },
  { id: 'chest',  parent: 'spine',  len: 30 },
  { id: 'neck',   parent: 'chest',  len: 16 },
  { id: 'head',   parent: 'neck',   len: 26 },
  { id: 'uArmL',  parent: 'chest',  len: 32 },
  { id: 'lArmL',  parent: 'uArmL',  len: 30 },
  { id: 'uArmR',  parent: 'chest',  len: 32 },
  { id: 'lArmR',  parent: 'uArmR',  len: 30 },
  { id: 'uLegL',  parent: 'pelvis', len: 44, atOrigin: true },
  { id: 'lLegL',  parent: 'uLegL',  len: 42 },
  { id: 'uLegR',  parent: 'pelvis', len: 44, atOrigin: true },
  { id: 'lLegR',  parent: 'uLegR',  len: 42 },
];
const JMAP = Object.fromEntries(JOINTS.map((j) => [j.id, j]));
const ID = JOINTS.map((j) => j.id);

// FK: origin of a joint = parent END (or parent ORIGIN for hip joints, so legs
// branch from the pelvis base rather than the top of the pelvis bone).
function fk(locals, rootPos) {
  const O = {}, E = {}, WA = {};
  for (const j of JOINTS) {
    let origin, parentWA;
    if (j.parent === null) { origin = rootPos; parentWA = 0; }
    else { parentWA = WA[j.parent]; origin = j.atOrigin ? O[j.parent] : E[j.parent]; }
    const wa = parentWA + locals[j.id];
    WA[j.id] = wa;
    O[j.id] = origin;
    E[j.id] = { x: origin.x + Math.cos(wa) * j.len, y: origin.y + Math.sin(wa) * j.len };
  }
  return { O, E, WA };
}

// ----------------------------------------------------------------------------
// poses authored in WORLD angles (readable) -> converted to LOCAL once at load.
// ----------------------------------------------------------------------------
const UP = -PI / 2;
const POSE_WORLD = {
  stand: {
    root: { x: 240, y: 235 },
    a: {
      pelvis: UP, spine: UP, chest: UP, neck: UP, head: UP,
      uArmL: 1.95, lArmL: 1.80, uArmR: 1.19, lArmR: 1.34,
      uLegL: 1.67, lLegL: 1.54, uLegR: 1.47, lLegR: 1.59,
    },
  },
  cheer: {
    root: { x: 256, y: 226 }, // weight shift up + toward planted leg
    a: {
      pelvis: -1.50, spine: -1.48, chest: -1.46, neck: -1.52, head: -1.58,
      uArmL: -2.35, lArmL: -2.20, uArmR: -0.80, lArmR: -0.95,
      uLegL: 1.78, lLegL: 1.66, uLegR: 1.38, lLegR: 1.50,
    },
  },
};
function worldsToLocals(w) {
  const loc = {};
  for (const j of JOINTS) {
    const pWA = j.parent === null ? 0 : w[j.parent];
    loc[j.id] = wrapPi(w[j.id] - pWA);
  }
  return loc;
}
const POSE = {
  stand: { root: POSE_WORLD.stand.root, local: worldsToLocals(POSE_WORLD.stand.a) },
  cheer: { root: POSE_WORLD.cheer.root, local: worldsToLocals(POSE_WORLD.cheer.a) },
};

// ----------------------------------------------------------------------------
// live base-blend state (L1). L[id] is the persistent base local angle that
// SmoothDamp integrates; V[id] is its carried angular velocity.
// ----------------------------------------------------------------------------
let mode = 'smoothdamp';           // 'smoothdamp' | 'lerp'
let curPoseName = 'stand';
let targetPoseName = 'stand';
const L = {}, V = {};              // base local angle + velocity ref per joint
for (const id of ID) { L[id] = POSE.stand.local[id]; V[id] = { v: 0 }; }
let rootPos = { x: POSE.stand.root.x, y: POSE.stand.root.y };
const rootV = { x: { v: 0 }, y: { v: 0 } };
let smoothTime = 0.4;

// lerp-mode transition bookkeeping (position-continuous only; kept to demo the pop)
let lerp = { active: false, elapsed: 0, dur: 0.65, startL: {}, startRoot: {}, targetL: {}, targetRoot: {} };

function blendTo(name, durationMs = 650) {
  if (!POSE[name]) return;
  targetPoseName = name;
  const durSec = Math.max(0.05, durationMs / 1000);
  smoothTime = durSec * 0.6;               // smoothdamp settles ~within durSec
  if (mode === 'lerp') {
    lerp.active = true; lerp.elapsed = 0; lerp.dur = durSec;
    for (const id of ID) { lerp.startL[id] = L[id]; lerp.targetL[id] = POSE[name].local[id]; }
    lerp.startRoot = { x: rootPos.x, y: rootPos.y };
    lerp.targetRoot = { x: POSE[name].root.x, y: POSE[name].root.y };
  }
}

// ----------------------------------------------------------------------------
// L2 additive procedural: breathing. Small angular deltas on torso joints,
// applied AFTER the base blend, always on (incl. during crossfades). Never
// written back into L -- kept in a separate `final` map so it can't accumulate
// into the SmoothDamp integrator.
// ----------------------------------------------------------------------------
const BREATH_HZ = 0.4;
const BREATH = { chest: 0.030, neck: -0.018, uArmL: 0.024, uArmR: -0.024 };
const BREATH_BOB = 1.2; // px vertical root bob

// ----------------------------------------------------------------------------
// L3 verlet secondary (follow-through). Particles for both hands + head; their
// constraint TARGET is the POST-ADDITIVE FK end position each sim tick. A hard
// length constraint to the (FK) anchor turns positional lag into angular swing.
// ----------------------------------------------------------------------------
const SECONDARY = {
  lArmL: { anchor: 'uArmL' }, // hand L, anchor = elbow (uArm end)
  lArmR: { anchor: 'uArmR' },
  head:  { anchor: 'neck' },  // head tip, anchor = neck end
};
const VERLET = { stiffness: 0.28, damping: 0.86, iterations: 2 };
const particles = {}; // id -> { pos, prev }

function verletTick(id, target, anchor, boneLen) {
  let p = particles[id];
  if (!p) { p = particles[id] = { pos: { x: target.x, y: target.y }, prev: { x: target.x, y: target.y } }; }
  // verlet integrate (implicit velocity = pos - prev)
  const vx = (p.pos.x - p.prev.x) * VERLET.damping;
  const vy = (p.pos.y - p.prev.y) * VERLET.damping;
  p.prev.x = p.pos.x; p.prev.y = p.pos.y;
  p.pos.x += vx; p.pos.y += vy;
  for (let i = 0; i < VERLET.iterations; i++) {
    // spring toward the post-additive FK target
    p.pos.x += (target.x - p.pos.x) * VERLET.stiffness;
    p.pos.y += (target.y - p.pos.y) * VERLET.stiffness;
    // hard length constraint to the anchor -> lag becomes a swing, keeps bone length
    let dx = p.pos.x - anchor.x, dy = p.pos.y - anchor.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    p.pos.x = anchor.x + (dx / d) * boneLen;
    p.pos.y = anchor.y + (dy / d) * boneLen;
  }
  return p.pos;
}

// ----------------------------------------------------------------------------
// instrumentation: per-bone rendered angular velocity via finite difference per
// sim tick; the "pop" metric is the largest single-tick CHANGE in that velocity.
// ----------------------------------------------------------------------------
const STEP = 1 / 120;
let stats = null;
function resetStats() {
  stats = { ticks: 0, maxJump: 0, maxSignFlip: 0, peakVel: 0, per: {} };
  for (const id of ID) stats.per[id] = { prevA: null, prevV: null, prevSign: 0, maxJump: 0, flips: 0, ticks: 0 };
}
resetStats();

// rendered world angle of a bone from its rendered origin/end points
function boneAngle(pts, id) {
  const b = pts[id];
  return Math.atan2(b.by - b.ay, b.bx - b.ax);
}
function measure(pts) {
  stats.ticks++;
  for (const id of ID) {
    const s = stats.per[id];
    const ang = boneAngle(pts, id);
    if (s.prevA !== null) {
      const vDeg = wrapPi(ang - s.prevA) * DEG; // deg per tick
      if (s.prevV !== null) {
        const jump = Math.abs(vDeg - s.prevV); // single-tick change in velocity
        if (jump > s.maxJump) s.maxJump = jump;
        if (jump > stats.maxJump) stats.maxJump = jump;
      }
      const sign = Math.sign(vDeg);
      if (s.prevSign !== 0 && sign !== 0 && sign !== s.prevSign) s.flips++;
      s.prevSign = sign;
      s.prevV = vDeg;
      s.ticks++;
      if (Math.abs(vDeg) > stats.peakVel) stats.peakVel = Math.abs(vDeg);
    }
    s.prevA = ang;
  }
}
function blendStats() {
  const per = {};
  let maxFlip = 0;
  for (const id of ID) {
    const s = stats.per[id];
    const rate = s.ticks ? s.flips / s.ticks : 0;
    if (rate > maxFlip) maxFlip = rate;
    per[id] = { maxJumpDegPerTick: +s.maxJump.toFixed(4), signFlipRate: +rate.toFixed(4) };
  }
  return {
    windowTicks: stats.ticks,
    maxVelocityJumpDegPerTick: +stats.maxJump.toFixed(4),
    peakVelocityDegPerTick: +stats.peakVel.toFixed(4),
    maxSignFlipRate: +maxFlip.toFixed(4),
    mode,
    perJoint: per,
  };
}

// ----------------------------------------------------------------------------
// the per-tick composition pipeline (THE ORDER being proven)
// ----------------------------------------------------------------------------
let simTime = 0;
function sim(dt) {
  simTime += dt;

  // --- L1: base-pose blend ---------------------------------------------------
  if (mode === 'smoothdamp') {
    const tgt = POSE[targetPoseName];
    for (const id of ID) L[id] = smoothDampAngle(L[id], tgt.local[id], V[id], smoothTime, dt);
    rootPos.x = smoothDamp(rootPos.x, tgt.root.x, rootV.x, smoothTime, dt);
    rootPos.y = smoothDamp(rootPos.y, tgt.root.y, rootV.y, smoothTime, dt);
  } else {
    if (lerp.active) {
      lerp.elapsed += dt;
      const p = smoothstep(clamp01(lerp.elapsed / lerp.dur));
      for (const id of ID) L[id] = lerp.startL[id] + wrapPi(lerp.targetL[id] - lerp.startL[id]) * p;
      rootPos.x = lerp.startRoot.x + (lerp.targetRoot.x - lerp.startRoot.x) * p;
      rootPos.y = lerp.startRoot.y + (lerp.targetRoot.y - lerp.startRoot.y) * p;
      if (lerp.elapsed >= lerp.dur) lerp.active = false;
    }
  }
  curPoseName = targetPoseName;

  // --- L2: additive procedural (breathing), on top of base blend -------------
  const s = Math.sin(2 * PI * BREATH_HZ * simTime);
  const finalLocal = {};
  for (const id of ID) finalLocal[id] = L[id] + (BREATH[id] ? BREATH[id] * s : 0);
  // root bob is a positional additive; enters AFTER the base root offset.
  const rp = { x: rootPos.x, y: rootPos.y + BREATH_BOB * s };

  // --- FK solve of the POST-ADDITIVE pose -> ideal world targets -------------
  const { O, E } = fk(finalLocal, rp);

  // --- L3: verlet secondary tracks the POST-ADDITIVE FK targets --------------
  const overrideEnd = {};
  for (const id in SECONDARY) {
    const anchor = O[id];                         // this bone's origin (FK)
    const target = E[id];                         // post-additive FK end
    overrideEnd[id] = verletTick(id, target, anchor, JMAP[id].len);
  }

  // --- assemble rendered points (origin + end per bone) ----------------------
  const pts = {};
  for (const id of ID) {
    const end = overrideEnd[id] || E[id];
    pts[id] = { ax: O[id].x, ay: O[id].y, bx: end.x, by: end.y };
  }

  measure(pts);
  return pts;
}

// ----------------------------------------------------------------------------
// SVG element setup + interpolated render write
// ----------------------------------------------------------------------------
const svg = document.getElementById('stage');
const NS = 'http://www.w3.org/2000/svg';
const lineEl = {};
for (const id of ID) {
  const ln = document.createElementNS(NS, 'line');
  ln.setAttribute('class', 'bone' + (SECONDARY[id] ? ' verlet' : ''));
  svg.appendChild(ln);
  lineEl[id] = ln;
}
const headEl = document.createElementNS(NS, 'circle');
headEl.setAttribute('class', 'head'); headEl.setAttribute('r', '13'); svg.appendChild(headEl);
const handLEl = document.createElementNS(NS, 'circle');
handLEl.setAttribute('class', 'hand'); handLEl.setAttribute('r', '5'); svg.appendChild(handLEl);
const handREl = document.createElementNS(NS, 'circle');
handREl.setAttribute('class', 'hand'); handREl.setAttribute('r', '5'); svg.appendChild(handREl);
const pelvisDot = document.createElementNS(NS, 'circle');
pelvisDot.setAttribute('class', 'joint'); pelvisDot.setAttribute('r', '4'); svg.appendChild(pelvisDot);

function draw(prev, cur, alpha) {
  const lerpN = (a, b) => a + (b - a) * alpha;
  for (const id of ID) {
    const p = prev[id], c = cur[id];
    const ln = lineEl[id];
    ln.setAttribute('x1', lerpN(p.ax, c.ax)); ln.setAttribute('y1', lerpN(p.ay, c.ay));
    ln.setAttribute('x2', lerpN(p.bx, c.bx)); ln.setAttribute('y2', lerpN(p.by, c.by));
  }
  const hp = prev.head, hc = cur.head;
  headEl.setAttribute('cx', lerpN(hp.bx, hc.bx)); headEl.setAttribute('cy', lerpN(hp.by, hc.by));
  const lp = prev.lArmL, lc = cur.lArmL;
  handLEl.setAttribute('cx', lerpN(lp.bx, lc.bx)); handLEl.setAttribute('cy', lerpN(lp.by, lc.by));
  const rp = prev.lArmR, rc = cur.lArmR;
  handREl.setAttribute('cx', lerpN(rp.bx, rc.bx)); handREl.setAttribute('cy', lerpN(rp.by, rc.by));
  const pp = prev.pelvis, pc = cur.pelvis;
  pelvisDot.setAttribute('cx', lerpN(pp.ax, pc.ax)); pelvisDot.setAttribute('cy', lerpN(pp.ay, pc.ay));
}

// ----------------------------------------------------------------------------
// fixed-timestep rAF loop with render interpolation
// ----------------------------------------------------------------------------
let prevSnap = sim(STEP);
let curSnap = sim(STEP);
let acc = 0;
let last = performance.now();

let autoOn = true;
let nextAutoAt = 2.5;

const statsEl = document.getElementById('stats');
let uiClock = 0;

function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25; // avoid spiral of death on tab wake
  acc += dt;
  while (acc >= STEP) {
    // auto ping-pong
    if (autoOn && simTime >= nextAutoAt) {
      blendTo(targetPoseName === 'stand' ? 'cheer' : 'stand', 700);
      nextAutoAt = simTime + 2.5;
    }
    prevSnap = curSnap;
    curSnap = sim(STEP);
    acc -= STEP;
  }
  const alpha = acc / STEP;
  draw(prevSnap, curSnap, alpha);

  uiClock += dt;
  if (uiClock > 0.2) {
    uiClock = 0;
    const st = blendStats();
    statsEl.innerHTML =
      `mode: <span class="mode">${st.mode}</span>   pose: ${curPoseName} -> ${targetPoseName}   auto: ${autoOn}\n` +
      `window ticks: ${st.windowTicks}\n` +
      `maxVelocityJumpDegPerTick: ${st.maxVelocityJumpDegPerTick}\n` +
      `peakVelocityDegPerTick:    ${st.peakVelocityDegPerTick}\n` +
      `maxSignFlipRate:           ${st.maxSignFlipRate}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ----------------------------------------------------------------------------
// window hooks (drive from console + headless check)
// ----------------------------------------------------------------------------
window.__blendTo = (name, ms = 650) => blendTo(name, ms);
window.__blendStats = () => blendStats();
window.__blendReset = () => { resetStats(); return true; };
window.__setMode = (m) => { if (m === 'smoothdamp' || m === 'lerp') { mode = m; lerp.active = false; } return mode; };
window.__autoBlend = (on) => { autoOn = (on === undefined) ? !autoOn : !!on; return autoOn; };
// classic pop case: start A->B, then 300 ms in, retarget back to A.
window.__blendStress = () => {
  autoOn = false;
  const from = curPoseName;
  const to = from === 'stand' ? 'cheer' : 'stand';
  blendTo(to, 650);
  setTimeout(() => blendTo(from, 650), 300);
  return { from, to };
};
console.log('Spike B ready — __blendTo/__blendStats/__blendReset/__blendStress/__setMode/__autoBlend');
