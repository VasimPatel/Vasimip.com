// Skin extractor (parity Stage 2b) — transcribes the legacy pose art
// (src/notebook/poses/*.tsx) and its keyframes (src/notebook/styles.css) into
// data-driven skin docs (content/engine/skins/*.json). Deliberately tolerant:
// elements whose attributes contain JSX expressions (the parametric Idle/Spray
// eyes) are SKIPPED WITH A WARNING and hand-authored afterward; the cape path
// (fill #ff5ca8) is dropped — the engine's verlet cape owns it.
//
// Usage: node packages/renderer-svg/dev/extract-skins.mjs [poseName ...]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const POSES_DIR = join(ROOT, 'src/notebook/poses')
const OUT_DIR = join(ROOT, 'content/engine/skins')
mkdirSync(OUT_DIR, { recursive: true })

// pose component file → skin id + the engine pose/clip ids it skins.
// (engine pose names differ from file names for some — the V1_POSE_RENAMES map.)
const SOURCE_MAP = {
  Idle: ['stand', 'idle-shuffle'],
  // '__gait' is the locomotion controller's synthetic ground-gait blend source —
  // claiming it puts the legacy walk drawing on every ground move.
  Walk: ['walk-mid', 'walk-cycle', '__gait'],
  Tuck: ['jump-tuck', 'jump'],
  Land: ['squash-land'],
  Fight: ['fight'],
  Spray: ['spray'],
  Think: ['think'],
  Vault: ['vault'],
  Rope: ['rope'],
  Swing: ['swing'],
  Wallrun: ['wallrun'],
  Slide: ['slide'],
  Surf: ['surf'],
  Dangle: ['dangle'],
  Throw: ['throw'],
  Wave: ['wave'],
  Cheer: ['cheer'],
  Trip: ['trip'],
  Sneeze: ['sneeze'],
  Shove: ['shove'],
  Punch: ['punch'],
  Peek: ['peek'],
  Hang: ['hang'],
  Knock: ['knock'],
}

// ── keyframes: parse styles.css @keyframes into data ─────────────────────────
function parseTransform(str) {
  const out = {}
  const re = /(translate|translateX|translateY|rotate|scale|scaleX|scaleY)\(([^)]*)\)/g
  let m
  while ((m = re.exec(str))) {
    const fn = m[1]
    const args = m[2].split(',').map((a) => parseFloat(a.trim()))
    if (fn === 'translate') out.translate = [args[0] || 0, args[1] || 0]
    else if (fn === 'translateX') out.translate = [args[0] || 0, (out.translate ?? [0, 0])[1]]
    else if (fn === 'translateY') out.translate = [(out.translate ?? [0, 0])[0], args[0] || 0]
    else if (fn === 'rotate') out.rotate = args[0] || 0
    else if (fn === 'scale') out.scale = [args[0] ?? 1, args[1] ?? args[0] ?? 1]
    else if (fn === 'scaleX') out.scale = [args[0] ?? 1, (out.scale ?? [1, 1])[1]]
    else if (fn === 'scaleY') out.scale = [(out.scale ?? [1, 1])[0], args[0] ?? 1]
  }
  return out
}

function parseKeyframes(css) {
  const table = {}
  const re = /@keyframes\s+([a-zA-Z][\w-]*)\s*\{/g
  let m
  while ((m = re.exec(css))) {
    const name = m[1]
    // find the matching close brace
    let depth = 1
    let i = re.lastIndex
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    const body = css.slice(re.lastIndex, i - 1)
    const frames = {}
    const stopRe = /([\d.%,\sfromto]+)\{([^}]*)\}/g
    let s
    while ((s = stopRe.exec(body))) {
      const offsets = s[1].split(',').map((o) => o.trim()).filter(Boolean)
      const decl = s[2]
      const frame = {}
      const tm = decl.match(/transform\s*:\s*([^;]+)/)
      if (tm) Object.assign(frame, parseTransform(tm[1]))
      const om = decl.match(/opacity\s*:\s*([\d.]+)/)
      if (om) frame.opacity = parseFloat(om[1])
      for (const off of offsets) {
        const pct = off === 'from' ? '0' : off === 'to' ? '100' : off.replace('%', '')
        frames[pct] = { ...frame }
      }
    }
    table[name] = frames
  }
  return table
}

// animation shorthand: "name 2.6s cubic-bezier(.3,.05,.35,1) infinite" etc.
function parseAnimShorthand(str) {
  const cleaned = str.trim()
  const nameM = cleaned.match(/^([a-zA-Z][\w-]*)/)
  if (!nameM) return null
  const name = nameM[1]
  const durM = cleaned.match(/(-?[\d.]+)s\b/)
  const duration = durM ? parseFloat(durM[1]) : 1
  const easeM = cleaned.match(/cubic-bezier\([^)]*\)|linear|ease-in-out|ease-in|ease-out|ease(?![\w-])/)
  const ease = easeM ? easeM[0] : undefined
  const iterations = /infinite/.test(cleaned) ? 'infinite' : undefined
  const fill = /forwards/.test(cleaned) ? 'forwards' : undefined
  // an explicit iteration count like " 3 " (cheerbounce .55s ×3)
  const countM = cleaned.match(/\)\s+(\d+)\s*$/) ?? cleaned.match(/s\s+(\d+)\s*$/)
  const count = countM ? parseInt(countM[1], 10) : undefined
  // a SECOND time value is a delay ("name .45s ease -0.2s infinite")
  const times = [...cleaned.matchAll(/(-?[\d.]+)s\b/g)].map((t) => parseFloat(t[1]))
  const delaySec = times.length > 1 ? times[1] : undefined
  return { name, duration, ease, iterations: iterations ?? count, fill, delaySec }
}

// ── tolerant JSX tokenizer ────────────────────────────────────────────────────
// Walks self-closing and container tags in document order with a group stack.
function parseJsx(tsx, warn) {
  const body = tsx
  const rootChildren = []
  const stack = [{ children: rootChildren }]
  const tagRe = /<(\/?)(g|path|circle|ellipse|rect|line)\b([^>]*?)(\/?)>/gs
  let m
  while ((m = tagRe.exec(body))) {
    const [, close, tag, rawAttrs, selfClose] = m
    if (close) {
      if (tag === 'g' && stack.length > 1) stack.pop()
      continue
    }
    const attrs = parseAttrs(rawAttrs, warn)
    if (attrs === null) {
      warn(`skipped <${tag}> with JSX-expression attributes`)
      // a skipped CONTAINER group must still balance its </g> — push a marked
      // placeholder so the close tag pops IT, not an ancestor (Idle/Spray bug:
      // the parametric head-tilt group's close was popping idlesway early).
      if (tag === 'g' && !selfClose) {
        const skip = { kind: 'group', __skip: true, children: [] }
        stack[stack.length - 1].children.push(skip)
        stack.push(skip)
      }
      continue
    }
    if (tag === 'g') {
      const grp = { kind: 'group', children: [] }
      const style = attrs.__style ?? {}
      if (style.animation) {
        const a = parseAnimShorthand(style.animation)
        if (a) {
          grp.anim = { name: a.name }
          if (a.delaySec !== undefined) grp.anim.delaySec = a.delaySec
        }
      }
      if (style.animationDelay) {
        const d = parseFloat(style.animationDelay)
        if (Number.isFinite(d)) grp.anim = { ...(grp.anim ?? { name: '?' }), delaySec: d }
      }
      if (style.transformOrigin) grp.origin = style.transformOrigin
      // static transforms come as a style OR as the SVG attribute (the legacy
      // limb positioning wrappers: <g transform="translate(0,-10)">)
      if (style.transform) grp.transform = style.transform
      else if (attrs.transform) grp.transform = attrs.transform
      stack[stack.length - 1].children.push(grp)
      if (!selfClose) stack.push(grp)
      continue
    }
    const el = elementFrom(tag, attrs, warn)
    if (el) stack[stack.length - 1].children.push(el)
  }
  return rootChildren
}

function parseAttrs(raw, warn) {
  const attrs = {}
  // style={{ ... }} (JS object literal — parse simple key: value pairs)
  const styleM = raw.match(/style=\{\{([\s\S]*?)\}\}/)
  if (styleM) {
    const style = {}
    const kv = /([a-zA-Z]+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([-\d.]+))/g
    let s
    while ((s = kv.exec(styleM[1]))) style[s[1]] = s[2] ?? s[3] ?? s[4]
    attrs.__style = style
  }
  const cleaned = raw.replace(/style=\{\{[\s\S]*?\}\}/, '')
  // a remaining ={expr} attribute means parametric art — signal the caller
  if (/=\{/.test(cleaned)) return null
  const re = /([a-zA-Z-]+)=(?:"([^"]*)"|'([^']*)'|\{([-\d.]+)\})/g
  let a
  while ((a = re.exec(cleaned))) attrs[a[1]] = a[2] ?? a[3] ?? a[4]
  return attrs
}

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

function paint(attrs) {
  const p = {}
  if (attrs.fill !== undefined && attrs.fill !== 'none') p.fill = attrs.fill
  if (attrs.fill === 'none') p.fill = 'none'
  if (attrs.stroke !== undefined) p.stroke = attrs.stroke
  const sw = num(attrs['strokeWidth'] ?? attrs['stroke-width'])
  if (sw !== undefined) p.strokeWidth = sw
  const lc = attrs['strokeLinecap'] ?? attrs['stroke-linecap']
  if (lc) p.linecap = lc
  const op = num(attrs.opacity ?? attrs.__style?.opacity)
  if (op !== undefined) p.opacity = op
  return p
}

function elementFrom(tag, attrs, warn) {
  if (tag === 'path') {
    if (!attrs.d) return warn('path without d'), null
    return { kind: 'path', d: attrs.d, ...paint(attrs) }
  }
  if (tag === 'circle') {
    return { kind: 'circle', cx: num(attrs.cx) ?? 0, cy: num(attrs.cy) ?? 0, r: num(attrs.r) ?? 0, ...paint(attrs) }
  }
  if (tag === 'ellipse') {
    return { kind: 'ellipse', cx: num(attrs.cx) ?? 0, cy: num(attrs.cy) ?? 0, rx: num(attrs.rx) ?? 0, ry: num(attrs.ry) ?? 0, ...paint(attrs) }
  }
  if (tag === 'rect') {
    const el = { kind: 'rect', x: num(attrs.x) ?? 0, y: num(attrs.y) ?? 0, w: num(attrs.width) ?? 0, h: num(attrs.height) ?? 0, ...paint(attrs) }
    const rx = num(attrs.rx)
    if (rx !== undefined) el.rx = rx
    return el
  }
  if (tag === 'line') {
    // normalize to a path (skin schema keeps a small element set)
    const x1 = num(attrs.x1) ?? 0, y1 = num(attrs.y1) ?? 0, x2 = num(attrs.x2) ?? 0, y2 = num(attrs.y2) ?? 0
    return { kind: 'path', d: `M${x1},${y1} L${x2},${y2}`, ...paint(attrs) }
  }
  return null
}

// drop the cape (engine verlet cape owns it) — the pink fill is its signature —
// plus skip placeholders and groups left empty by skipped parametric children.
function prune(elements, warn) {
  const out = []
  for (const e of elements) {
    if (e.kind === 'path' && e.fill === '#ff5ca8') {
      warn('dropped cape path (engine verlet cape)')
      continue
    }
    if (e.kind === 'group') {
      if (e.__skip) {
        warn('dropped skipped parametric group')
        continue
      }
      e.children = prune(e.children, warn)
      if (e.children.length === 0) {
        warn(`dropped empty group${e.anim ? ` (${e.anim.name})` : ''}`)
        continue
      }
    }
    out.push(e)
  }
  return out
}

// Per-pose hand fixups: the parametric-face poses (legacy Idle/Spray track the
// cursor with their eyes) hand their face to the ENGINE face (pupil dilation,
// blink, look-at, pose-face brows/mouth); their baked smirk/eyes drop here.
const FIXUPS = {
  Idle: {
    face: 'parametric',
    dropD: ['M3,-21'],
    // the legacy head + bandana ties live inside the PARAMETRIC head-tilt group
    // (skipped by the parser) — re-inject them; the engine's look-at head + face
    // ride the head anchor instead of the JSX headTilt.
    inject: [
      { kind: 'circle', cx: 2, cy: -30, r: 14, fill: '#fffdf6', stroke: '#1a1a1a', strokeWidth: 4 },
      { kind: 'path', d: 'M-5,-36 l9,2.5 M9,-34 l9,-2.5', fill: 'none', stroke: '#1a1a1a', strokeWidth: 2.6, linecap: 'round' },
    ],
  },
  Spray: { face: 'parametric', dropD: ['M3,-21'], dropInkEyeDots: true },
}

function applyFixups(base, skin, warn) {
  const fix = FIXUPS[base]
  if (!fix) return
  if (fix.face) skin.face = fix.face
  const drop = (list) =>
    list.filter((e) => {
      if (e.kind === 'path' && fix.dropD?.some((d) => e.d.startsWith(d))) {
        warn(`fixup: dropped baked face path ${e.d.slice(0, 12)}…`)
        return false
      }
      if (fix.dropInkEyeDots && e.kind === 'circle' && e.fill === '#1a1a1a' && e.r <= 2.5 && e.cy < -20) {
        warn('fixup: dropped baked eye dot')
        return false
      }
      if (e.kind === 'group') e.children = drop(e.children)
      return !(e.kind === 'group' && e.children.length === 0)
    })
  skin.elements = drop(skin.elements)
  if (fix.inject) skin.elements = [...fix.inject, ...skin.elements]
}

/** Find the head circle (paper-fill circle with the biggest r) for the anchor. */
function findHead(elements) {
  let best = null
  const visit = (list) => {
    for (const e of list) {
      if (e.kind === 'circle' && (e.fill === '#fffdf6' || e.fill === '#fdfbf3') && e.r >= 9) {
        if (!best || e.r > best.r) best = e
      }
      if (e.kind === 'group') visit(e.children)
    }
  }
  visit(elements)
  return best ? { cx: best.cx, cy: best.cy, r: best.r } : undefined
}

/** Which keyframe names a skin references (for the shared-table filter). */
function collectAnims(skin) {
  const names = new Set()
  const visit = (e) => {
    if (e.kind !== 'group') return
    if (e.anim) names.add(e.anim.name)
    e.children.forEach(visit)
  }
  skin.elements.forEach(visit)
  if (skin.groupAnim) names.add(skin.groupAnim.name)
  return names
}

// ── main ─────────────────────────────────────────────────────────────────────
const css = readFileSync(join(ROOT, 'src/notebook/styles.css'), 'utf8')
const rawFrames = parseKeyframes(css)
// durations/eases live at the USE SITE in legacy (shorthand) — the shared table
// stores them from the first use; per-use overrides aren't needed (legacy uses
// consistent durations per name, with the poke/fidget variants split by name).
const keyframeMeta = {}

const only = process.argv.slice(2)
const files = readdirSync(POSES_DIR).filter((f) => f.endsWith('.tsx'))
const usedAnims = new Set()
let skinsWritten = 0

for (const file of files) {
  const base = file.replace('.tsx', '')
  if (only.length > 0 && !only.includes(base)) continue
  const sources = SOURCE_MAP[base]
  if (!sources) {
    console.log(`- ${base}: no source mapping (skipped)`)
    continue
  }
  const warns = []
  const warn = (msg) => warns.push(msg)
  const tsx = readFileSync(join(POSES_DIR, file), 'utf8')

  // top-level group animation: the OUTER <g> right inside the pose fragment
  const elements0 = parseJsx(tsx, warn)
  // parseJsx returns the tree; the pose's own wrapper <g> (if the file has one
  // top group) becomes elements[0] — unwrap it into groupAnim + children.
  let elements = elements0
  let groupAnim
  if (elements0.length === 1 && elements0[0].kind === 'group') {
    const top = elements0[0]
    if (top.anim) groupAnim = { name: top.anim.name, ...(top.anim.delaySec !== undefined ? { delaySec: top.anim.delaySec } : {}), ...(top.origin ? { origin: top.origin } : {}) }
    else if (top.transform || top.origin) {
      // static whole-figure transform (vault/wallrun rotations) — keep the wrapper
      groupAnim = undefined
    }
    elements = top.anim ? top.children : elements0
  }
  elements = prune(elements, warn)
  if (elements.length === 0) {
    console.log(`- ${base}: EMPTY after parse (parametric?) — hand-author this one. warns: ${warns.join('; ')}`)
    continue
  }

  const skin = {
    schemaVersion: 2,
    id: `skin:${sources[0]}`,
    sources,
    face: 'baked',
    ...(groupAnim ? { groupAnim } : {}),
    elements,
  }
  applyFixups(base, skin, warn)
  // head anchor AFTER fixups (Idle's head is re-injected there)
  const head = findHead(skin.elements)
  if (head) skin.head = head

  // record anim durations/eases from the tsx use-sites into the shared table
  const animRe = /animation:\s*["']([^"']+)["']/g
  let am
  while ((am = animRe.exec(tsx))) {
    const a = parseAnimShorthand(am[1])
    if (a && rawFrames[a.name] && !keyframeMeta[a.name]) {
      keyframeMeta[a.name] = { duration: a.duration, ease: a.ease, iterations: a.iterations ?? 'infinite', fill: a.fill }
    }
  }
  for (const n of collectAnims(skin)) usedAnims.add(n)

  writeFileSync(join(OUT_DIR, `${sources[0]}.json`), JSON.stringify(skin, null, 2) + '\n')
  skinsWritten++
  console.log(`✓ ${base} → skins/${sources[0]}.json (${JSON.stringify(skin).length}b)${warns.length ? '  ⚠ ' + warns.join('; ') : ''}`)
}

// the shared keyframes table: only the names skins actually use
const keyframes = {}
for (const name of [...usedAnims].sort()) {
  const frames = rawFrames[name]
  if (!frames) {
    console.log(`⚠ keyframe '${name}' referenced but not found in styles.css`)
    continue
  }
  const meta = keyframeMeta[name] ?? { duration: 1, iterations: 'infinite' }
  keyframes[name] = {
    duration: meta.duration,
    ...(meta.ease ? { ease: meta.ease } : {}),
    ...(meta.iterations !== undefined ? { iterations: meta.iterations } : {}),
    ...(meta.fill ? { fill: meta.fill } : {}),
    frames,
  }
}
writeFileSync(join(OUT_DIR, 'keyframes.json'), JSON.stringify({ schemaVersion: 2, id: 'skin-keyframes', keyframes }, null, 2) + '\n')
console.log(`\n${skinsWritten} skins + keyframes.json (${Object.keys(keyframes).length} animations) → content/engine/skins/`)
