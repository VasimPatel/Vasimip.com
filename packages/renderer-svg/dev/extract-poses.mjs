// P9a pose extraction — fits rig joint angles ANALYTICALLY from the legacy pose
// components' SVG path coordinates (they are explicit polylines), emitting draft
// pose JSONs + per-pose warnings. Drafts are then reviewed/tuned in the P2
// side-by-side harness — this replaces pure eyeballing with fit-then-polish.
//
// Usage: node packages/renderer-svg/dev/extract-poses.mjs [poseName ...]
// Writes content/engine/poses/<kebab>.json for poses NOT already authored.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const POSES_DIR = join(ROOT, 'src/notebook/poses')
const OUT_DIR = join(ROOT, 'content/engine/poses')

// pose component → output name (the v1 arrival/step pose vocabulary)
const MAP = {
  Fight: 'fight', Spray: 'spray', Dangle: 'dangle', Throw: 'throw', Wave: 'wave',
  Trip: 'trip', Sneeze: 'sneeze', Vault: 'vault', Wallrun: 'wallrun', Rope: 'rope',
  Swing: 'swing', Slide: 'slide', Surf: 'surf', Shove: 'shove', Punch: 'punch',
  Peek: 'peek', Hang: 'hang', Knock: 'knock',
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** Parse path `d` (absolute M/L + relative l/h/v only) → points. */
function pathPoints(d) {
  const pts = []
  let x = 0, y = 0
  const re = /([MLlhv])\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?/g
  let m
  while ((m = re.exec(d))) {
    const [, cmd, a, b] = m
    const A = parseFloat(a), B = b !== undefined ? parseFloat(b) : 0
    if (cmd === 'M' || cmd === 'L') { x = A; y = B }
    else if (cmd === 'l') { x += A; y += B }
    else if (cmd === 'h') { x += A }
    else if (cmd === 'v') { y += A }
    pts.push({ x, y })
  }
  return pts
}

/** Extract drawable strokes with accumulated translate() offsets. */
function extract(src) {
  const strokes = []
  const stack = [{ dx: 0, dy: 0 }]
  // Tokenize tags in order; track <g transform="translate(x,y)"> nesting.
  const tag = /<(g|path|circle)\b([^>]*)>|<\/g>/g
  let m
  while ((m = tag.exec(src))) {
    if (m[0] === '</g>') { if (stack.length > 1) stack.pop(); continue }
    const [, name, attrs] = m
    const top = stack[stack.length - 1]
    if (name === 'g') {
      const t = /transform=["']translate\((-?[\d.]+)[ ,]+(-?[\d.]+)\)["']/.exec(attrs)
      const r = /transform=["']rotate\(/.exec(attrs)
      stack.push({ dx: top.dx + (t ? parseFloat(t[1]) : 0), dy: top.dy + (t ? parseFloat(t[2]) : 0), rotated: !!r || top.rotated })
      continue
    }
    if (name === 'path') {
      const d = /d=["']([^"']+)["']/.exec(attrs)?.[1]
      const w = parseFloat(/strokeWidth=["']([\d.]+)["']/.exec(attrs)?.[1] ?? '0')
      const fill = /fill=["']([^"']+)["']/.exec(attrs)?.[1]
      if (!d || (fill && fill !== 'none')) continue // cape/filled shapes skipped
      const pts = pathPoints(d).map((p) => ({ x: p.x + top.dx, y: p.y + top.dy }))
      strokes.push({ kind: 'path', w, pts, rotated: !!top.rotated })
    } else {
      const cx = parseFloat(/cx=["'](-?[\d.]+)["']/.exec(attrs)?.[1] ?? 'NaN')
      const cy = parseFloat(/cy=["'](-?[\d.]+)["']/.exec(attrs)?.[1] ?? 'NaN')
      const r = parseFloat(/r=["'](-?[\d.]+)["']/.exec(attrs)?.[1] ?? 'NaN')
      if (r >= 10) strokes.push({ kind: 'head', x: cx + top.dx, y: cy + top.dy, r, rotated: !!top.rotated })
    }
  }
  return strokes
}

/** Fit the 13-joint rig against classified strokes. Returns {pose, warnings}. */
function fit(strokes, name) {
  const warnings = []
  const head = strokes.find((s) => s.kind === 'head')
  const torso = strokes.find((s) => s.kind === 'path' && s.w >= 5.4)
  const legs = strokes.filter((s) => s.kind === 'path' && s.w >= 4.9 && s.w < 5.4 && s.pts.length >= 3)
  const arms = strokes.filter((s) => s.kind === 'path' && s.w >= 4.2 && s.w < 4.9 && s.pts.length >= 2)
  if (!torso) { warnings.push('no torso stroke found'); return { pose: null, warnings } }
  if (strokes.some((s) => s.rotated)) warnings.push('rotated groups present — fit ignores rotation, REVIEW')

  // Torso runs top→bottom in the legacy art; hip = the lower endpoint.
  const [tA, tB] = [torso.pts[0], torso.pts[torso.pts.length - 1]]
  const hip = tA.y > tB.y ? tA : tB
  const top = tA.y > tB.y ? tB : tA
  const angles = {}
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x)
  const pelvisWorld = ang(hip, top)
  angles.pelvis = wrap(pelvisWorld) // root local = world (root rot 0)
  const headC = head ? { x: head.x, y: head.y } : { x: top.x, y: top.y - 13 }
  const neckWorld = ang(top, headC)
  angles.neck = wrap(neckWorld - pelvisWorld)
  angles.head = 0

  // Arms: nearest-start-to-top = shoulder side; assign R = the one whose HAND has
  // greater x (legacy Dash faces right); warn on ties.
  const armFits = arms
    .filter((a) => Math.hypot(a.pts[0].x - top.x, a.pts[0].y - top.y) < 16)
    .slice(0, 2)
    .map((a) => {
      const sh = a.pts[0]
      const elbow = a.pts.length >= 3 ? a.pts[1] : a.pts[a.pts.length - 1]
      const hand = a.pts[a.pts.length - 1]
      const upperW = ang(sh, elbow)
      const foreW = a.pts.length >= 3 ? ang(elbow, hand) : upperW
      return { hand, upper: upperW, fore: foreW }
    })
  if (armFits.length === 2) {
    const [r, l] = armFits[0].hand.x >= armFits[1].hand.x ? armFits : [armFits[1], armFits[0]]
    angles.upperArmR = wrap(r.upper - pelvisWorld)
    angles.foreArmR = wrap(r.fore - r.upper)
    angles.upperArmL = wrap(l.upper - pelvisWorld)
    angles.foreArmL = wrap(l.fore - l.upper)
  } else warnings.push(`found ${armFits.length} arm strokes near the shoulder — arms need manual work`)

  // Legs from the hip: assign R = greater knee x.
  const legFits = legs
    .filter((s) => Math.hypot(s.pts[0].x - hip.x, s.pts[0].y - hip.y) < 10)
    .slice(0, 2)
    .map((s) => {
      const [h, knee, ankle, foot] = [s.pts[0], s.pts[1], s.pts[2], s.pts[3] ?? null]
      const thighW = ang(h, knee)
      const shinW = ang(knee, ankle)
      const footW = foot ? ang(ankle, foot) : shinW + 1.2
      return { knee, thighW, shinW, footW }
    })
  if (legFits.length === 2) {
    const [r, l] = legFits[0].knee.x >= legFits[1].knee.x ? legFits : [legFits[1], legFits[0]]
    angles.thighR = wrap(r.thighW - pelvisWorld)
    angles.shinR = wrap(r.shinW - r.thighW)
    angles.footR = wrap(r.footW - r.shinW)
    angles.thighL = wrap(l.thighW - pelvisWorld)
    angles.shinL = wrap(l.shinW - l.thighW)
    angles.footL = wrap(l.footW - l.shinW)
  } else warnings.push(`found ${legFits.length} leg strokes at the hip — legs need manual work`)

  const round = (v) => Math.round(v * 1e6) / 1e6
  for (const k of Object.keys(angles)) angles[k] = round(angles[k])
  // Root: hip position relative to the legacy figure origin (feet ≈ y 52).
  return { pose: { id: name, angles, root: { x: round(hip.x), y: round(hip.y), rot: 0 } }, warnings }
}

const only = process.argv.slice(2)
const results = []
for (const [comp, name] of Object.entries(MAP)) {
  if (only.length && !only.includes(name)) continue
  const out = join(OUT_DIR, `${name}.json`)
  if (existsSync(out)) { results.push(`${name}: SKIP (already authored)`); continue }
  const src = readFileSync(join(POSES_DIR, `${comp}.tsx`), 'utf8')
  const { pose, warnings } = fit(extract(src), name)
  if (!pose) { results.push(`${name}: FAILED — ${warnings.join('; ')}`); continue }
  writeFileSync(out, JSON.stringify(pose, null, 2) + '\n')
  results.push(`${name}: ok${warnings.length ? ' ⚠ ' + warnings.join('; ') : ''}`)
}
console.log(results.join('\n'))
