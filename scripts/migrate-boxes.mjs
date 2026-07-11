// One-off migration: the notebook's panel content model moves from typed flow
// `elements` (heading/text/caption/note/placeholder/checklist/custom + flow
// layout) to free-positioned whiteboard `boxes` (text/draw/art with x/y/w/h).
//
// The REAL notebook.json is sacred: every copy string survives byte-identical,
// and cover/name/snark/geometry/anchor/arrival/travel/actions survive deep-equal.
// We change the SHAPE of content, never its substance — asserted in-script.
//
// Positions come from a font-metrics approximation of the old flow/place layout;
// they are NOT pixel-perfect (the human side-by-side review is the real gate).
//
// Usage: node scripts/migrate-boxes.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(__dirname, '../src/notebook/notebook.json')
const WRITE = process.argv.includes('--write')

// ── font metrics (shared feel with PageRenderer's LINE_HEIGHT map) ───────────
const CW = { hand: 0.5, caveat: 0.5, marker: 0.62 } // avg char width / font size
const LH = { hand: 1.4, caveat: 1.2, marker: 1.05 } // line-height / font size
const round = (n) => Math.round(n)

// Greedy word-wrap line count (approximates the browser's word boundaries — a
// raw char count undercounts, e.g. "THE ADVENTURES OF" is 3 lines not 2).
function wrappedLines(text, size, fam, width) {
  const charW = size * CW[fam]
  let lines = 0
  for (const para of String(text).split('\n')) {
    let n = 1
    let cur = 0
    for (const wd of para.split(' ')) {
      const w = wd.length * charW
      if (cur === 0) cur = w
      else if (cur + charW + w <= width) cur += charW + w
      else { n++; cur = w }
      if (cur > width) { const extra = Math.ceil(w / width) - 1; n += extra; cur = w - extra * width }
    }
    lines += n
  }
  return lines
}
function textHeight(text, size, fam, width) {
  return wrappedLines(text, size, fam, width) * size * LH[fam]
}
function textWidth(text, size, fam) {
  return String(text).length * size * CW[fam]
}

function parsePadding(p) {
  if (!p) return { top: 0, right: 0, bottom: 0, left: 0 }
  const n = p.split(/\s+/).map((s) => parseFloat(s))
  if (n.length === 1) return { top: n[0], right: n[0], bottom: n[0], left: n[0] }
  if (n.length === 2) return { top: n[0], right: n[1], bottom: n[0], left: n[1] }
  if (n.length === 3) return { top: n[0], right: n[1], bottom: n[2], left: n[1] }
  return { top: n[0], right: n[1], bottom: n[2], left: n[3] }
}

const TONE_COLOR = { ink: '#1a1a1a', muted: '#5a544a', faint: '#8a8378' }

// ── per-panel: element[] → box[] ─────────────────────────────────────────────
function migratePanel(panel) {
  const pad = parsePadding(panel.padding)
  const innerX = pad.left
  const innerW = panel.w - pad.left - pad.right
  const innerBottom = panel.h - pad.bottom
  const gap = panel.layout === 'flow' ? (panel.gap || 0) : 0
  const els = panel.elements

  const isOverlay = (el) => el.place || (el.type === 'custom' && el.component === 'fightScene')
  const isFlexible = (el) => (el.type === 'placeholder' && el.grow) || (el.type === 'custom')

  // measure a fixed (non-flexible, in-flow) element's natural height
  const measure = (el) => {
    switch (el.type) {
      case 'heading': {
        let h = textHeight(el.text, el.size, 'marker', innerW)
        if (el.prefix) h += textHeight(el.prefix, el.size, 'marker', innerW)
        return h
      }
      case 'text': {
        const fam = el.tone === 'muted' && el.size >= 24 ? 'caveat' : 'hand'
        return textHeight(el.text, el.size, fam, innerW)
      }
      case 'caption': return textHeight(el.text, el.size ?? 16, 'caveat', innerW)
      case 'note': return textHeight(el.text, el.size ?? 16, 'hand', (el.place?.width ?? innerW) - 28) + 24
      case 'checklist': return textHeight(el.items.map((i) => '✓ ' + i).join('\n'), el.size ?? 16, 'hand', innerW)
      default: return 0
    }
  }

  // remaining height shared by flexible (grow placeholder / block-flow art) items
  const flowEls = els.filter((el) => !isOverlay(el))
  const fixedH = flowEls.filter((el) => !isFlexible(el)).reduce((t, el) => t + measure(el), 0)
  const nGaps = Math.max(0, flowEls.length - 1)
  const remaining = innerBottom - pad.top - fixedH - gap * nGaps
  const flexCount = flowEls.filter(isFlexible).length
  const flexH = flexCount ? Math.max(40, remaining / flexCount) : 0

  // resolve a place'd element's absolute {x,y,w}, given its measured height
  const resolvePlace = (place, h, contentW) => {
    const w = place.width ?? contentW ?? innerW
    let x = innerX
    if (place.left !== undefined) x = place.left
    else if (place.right !== undefined) x = panel.w - place.right - w
    let y = pad.top
    if (place.top !== undefined) y = place.top
    else if (place.bottom !== undefined) y = panel.h - place.bottom - h
    return { x, y, w }
  }

  const R = (b) => ({ ...b, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) })

  const boxes = []
  let y = pad.top

  const emitHeading = (el, baseY) => {
    let yy = baseY
    if (el.prefix) {
      const ph = textHeight(el.prefix, el.size, 'marker', innerW)
      boxes.push(R({ kind: 'text', x: innerX, y: yy, w: innerW, h: ph, text: el.prefix, fam: 'marker', size: el.size }))
      yy += ph
    }
    const hh = textHeight(el.text, el.size, 'marker', innerW)
    const hb = { kind: 'text', x: innerX, y: yy, w: innerW, h: hh, text: el.text, fam: 'marker', size: el.size }
    if (el.highlight) hb.hl = el.highlight
    if (el.rotate !== undefined) hb.rot = el.rotate
    boxes.push(R(hb))
    if (el.suffix) {
      const ss = el.text === 'FUN FACTS' ? 15 : 16
      const tw = textWidth(el.text, el.size, 'marker')
      boxes.push(R({ kind: 'text', x: innerX + tw + 8, y: yy + el.size * 0.3, w: Math.max(60, innerW - tw - 8), h: ss * 1.4, text: el.suffix, fam: 'caveat', size: ss, color: '#8a8378' }))
    }
    return yy + hh
  }

  const emitTextEl = (el, x, yPos, w) => {
    const fam = el.tone === 'muted' && el.size >= 24 ? 'caveat' : 'hand'
    const h = textHeight(el.text, el.size, fam, w)
    boxes.push(R({ kind: 'text', x, y: yPos, w, h, text: el.text, fam, size: el.size, color: TONE_COLOR[el.tone ?? 'ink'] }))
    return h
  }

  const emitCaption = (el, x, yPos, w) => {
    const s = el.size ?? 16
    boxes.push(R({ kind: 'text', x, y: yPos, w, h: textHeight(el.text, s, 'caveat', w), text: el.text, fam: 'caveat', size: s, color: '#8a8378' }))
  }

  const emitNote = (el, x, yPos, w) => {
    const s = el.size ?? 16
    const h = textHeight(el.text, s, 'hand', w - 28) + 24
    boxes.push(R({ kind: 'text', x, y: yPos, w, h, text: el.text, fam: 'hand', size: s, note: true }))
  }

  const emitChecklist = (el, x, yPos, w) => {
    const s = el.size ?? 16
    const text = el.items.map((i) => '✓ ' + i).join('\n')
    boxes.push(R({ kind: 'text', x, y: yPos, w, h: textHeight(text, s, 'hand', w), text, fam: 'hand', size: s }))
  }

  const emitArt = (el, box) => {
    const b = { kind: 'art', ...box, component: el.component }
    if (el.props !== undefined) b.props = el.props
    if (el.showIfFlag) b.showIfFlag = el.showIfFlag
    boxes.push(R(b))
  }

  // placeholder → locked `placeholder` art box carrying its label
  const emitPlaceholder = (el, box) => {
    const b = { kind: 'art', ...box, component: 'placeholder', props: { label: el.text } }
    if (el.showIfFlag) b.showIfFlag = el.showIfFlag
    boxes.push(R(b))
  }

  for (const el of els) {
    // full-panel overlay art (self-positions absolutely inside the panel)
    if (el.type === 'custom' && el.component === 'fightScene') {
      emitArt(el, { x: 0, y: 0, w: panel.w, h: panel.h })
      continue
    }
    // place'd elements: absolute, outside the flow — no cursor advance
    if (el.place) {
      if (el.type === 'note') {
        const h = measure(el)
        const { x, y: py, w } = resolvePlace(el.place, h, el.place.width)
        emitNote(el, x, py, w)
      } else if (el.type === 'caption') {
        const contentW = textWidth(el.text, el.size ?? 16, 'caveat')
        const h = textHeight(el.text, el.size ?? 16, 'caveat', el.place.width ?? contentW)
        const { x, y: py, w } = resolvePlace(el.place, h, contentW)
        emitCaption(el, x, py, w)
      } else if (el.type === 'text') {
        const fam = el.tone === 'muted' && el.size >= 24 ? 'caveat' : 'hand'
        const contentW = textWidth(el.text, el.size, fam)
        const h = textHeight(el.text, el.size, fam, el.place.width ?? contentW)
        const { x, y: py, w } = resolvePlace(el.place, h, contentW)
        emitTextEl(el, x, py, w)
      } else if (el.type === 'heading') {
        // (none in the real data — supported for completeness)
        const { y: py } = resolvePlace(el.place, measure(el), innerW)
        emitHeading(el, py)
      } else if (el.type === 'placeholder') {
        const { x, y: py, w } = resolvePlace(el.place, 60, el.place.width)
        emitPlaceholder(el, { x, y: py, w, h: 60 })
      } else if (el.type === 'custom') {
        const { x, y: py, w } = resolvePlace(el.place, 100, el.place.width)
        emitArt(el, { x, y: py, w, h: 100 })
      }
      continue
    }
    // in-flow elements
    const flexible = isFlexible(el)
    const h = flexible ? flexH : measure(el)
    switch (el.type) {
      case 'heading': emitHeading(el, y); break
      case 'text': emitTextEl(el, innerX, y, innerW); break
      case 'caption': emitCaption(el, innerX, y, innerW); break
      case 'note': emitNote(el, innerX, y, innerW); break
      case 'checklist': emitChecklist(el, innerX, y, innerW); break
      case 'placeholder': emitPlaceholder(el, { x: innerX, y, w: innerW, h }); break
      case 'custom': emitArt(el, { x: innerX, y, w: innerW, h }); break
    }
    y += h + gap
  }

  // rebuild the panel with `boxes` replacing element/layout fields
  const { elements, layout, padding, gap: _g, ...rest } = panel
  void elements; void layout; void padding; void _g
  return { x: rest.x, y: rest.y, w: rest.w, h: rest.h, anchor: rest.anchor, ...(rest.arrival ? { arrival: rest.arrival } : {}), ...(rest.travel ? { travel: rest.travel } : {}), ...(rest.rotate !== undefined ? { rotate: rest.rotate } : {}), ...(rest.sketch ? { sketch: rest.sketch } : {}), boxes }
}

// ── run ──────────────────────────────────────────────────────────────────────
const src = JSON.parse(readFileSync(FILE, 'utf8'))
// Idempotency guard: this migration consumes the OLD element model. If the file
// has already been migrated, refuse rather than crash — restore the pre-box
// version first (`git show <rev>:src/notebook/notebook.json`).
if (src.pages?.[0]?.panels?.[0]?.elements === undefined) {
  console.log('notebook.json is already migrated (panels use `boxes`, not `elements`). Nothing to do.')
  process.exit(0)
}
const out = {
  version: src.version,
  cover: src.cover,
  pages: src.pages.map((pg) => ({ name: pg.name, snark: pg.snark, ...(pg.travel ? { travel: pg.travel } : {}), panels: pg.panels.map(migratePanel) })),
  ...(src.actions ? { actions: src.actions } : {}),
  ...(src.travel ? { travel: src.travel } : {}),
}

// ── assertions ────────────────────────────────────────────────────────────────
const problems = []

// (a) every element copy string appears byte-identical inside some box in the SAME panel
function elementCopy(el) {
  switch (el.type) {
    case 'heading': return [el.text, ...(el.prefix ? [el.prefix] : []), ...(el.suffix ? [el.suffix] : [])]
    case 'text': case 'caption': case 'note': case 'placeholder': return [el.text]
    case 'checklist': return el.items.slice()
    default: return []
  }
}
// collect every string anywhere inside a value (box text, art props, labels…)
function allStrings(v, acc) {
  if (typeof v === 'string') acc.push(v)
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, acc))
  return acc
}
src.pages.forEach((pg, pi) => {
  pg.panels.forEach((panel, ppi) => {
    const boxTexts = allStrings(out.pages[pi].panels[ppi].boxes, [])
    for (const el of panel.elements) {
      for (const s of elementCopy(el)) {
        if (!boxTexts.some((t) => t.includes(s))) problems.push(`copy lost @ p${pi}.panel${ppi}: ${JSON.stringify(s)}`)
      }
      // custom art props preserved verbatim
      if (el.type === 'custom' && el.component !== 'fightScene') {
        const art = out.pages[pi].panels[ppi].boxes.find((b) => b.kind === 'art' && b.component === el.component)
        if (!art) problems.push(`art box missing @ p${pi}.panel${ppi}: ${el.component}`)
        else if (JSON.stringify(art.props ?? null) !== JSON.stringify(el.props ?? null)) problems.push(`art props changed @ p${pi}.panel${ppi}: ${el.component}`)
      }
    }
  })
})

// (b) deep-equal of the sacred substance (cover / name / snark / geometry / anchor / arrival / travel / actions)
function skeleton(doc) {
  return {
    cover: doc.cover,
    pages: doc.pages.map((pg) => ({
      name: pg.name,
      snark: pg.snark,
      travel: pg.travel ?? null,
      panels: pg.panels.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, anchor: p.anchor, arrival: p.arrival ?? null, travel: p.travel ?? null })),
    })),
    actions: doc.actions ?? null,
    travel: doc.travel ?? null,
  }
}
if (JSON.stringify(skeleton(src)) !== JSON.stringify(skeleton(out))) problems.push('SUBSTANCE CHANGED: skeleton deep-equal failed (cover/name/snark/geometry/anchor/arrival/travel/actions)')

// (c) validator: box/geometry/caps invariants on the result
const BOX_BAND = 400
const PATH_D_RE = /^[MLQCZmlqcz0-9 ,.\-]+$/
function validate(doc) {
  const iss = []
  const fin = (n) => typeof n === 'number' && Number.isFinite(n)
  doc.pages.forEach((pg, pi) => pg.panels.forEach((panel, ppi) => {
    const base = `p${pi}.panel${ppi}`
    if (!Array.isArray(panel.boxes) || panel.boxes.length === 0) { iss.push(`${base}.boxes empty`); return }
    if (panel.pid !== undefined && (typeof panel.pid !== 'string' || panel.pid.length > 24)) iss.push(`${base}.pid invalid`)
    panel.boxes.forEach((b, bi) => {
      const p = `${base}.box${bi}`
      if (!['text', 'draw', 'art'].includes(b.kind)) { iss.push(`${p}.kind ${b.kind}`); return }
      for (const k of ['x', 'y', 'w', 'h']) if (!fin(b[k])) iss.push(`${p}.${k} not finite`)
      if (fin(b.x) && fin(b.y) && (b.x < -BOX_BAND || b.x > panel.w + BOX_BAND || b.y < -BOX_BAND || b.y > panel.h + BOX_BAND)) iss.push(`${p} strayed (${b.x},${b.y})`)
      if (b.kind === 'text') {
        if (typeof b.text !== 'string') iss.push(`${p}.text`)
        else if (b.text.length > 2000) iss.push(`${p}.text too long`)
        if (b.fam !== undefined && !['hand', 'marker', 'caveat'].includes(b.fam)) iss.push(`${p}.fam ${b.fam}`)
        if (b.hl !== undefined && !['yellow', 'pink'].includes(b.hl)) iss.push(`${p}.hl ${b.hl}`)
      } else if (b.kind === 'draw') {
        if (!Array.isArray(b.strokes)) iss.push(`${p}.strokes`)
        else {
          if (b.strokes.length > 64) iss.push(`${p}.strokes count`)
          let tot = 0
          b.strokes.forEach((d, i) => { tot += String(d).length; if (!PATH_D_RE.test(d)) iss.push(`${p}.strokes[${i}] grammar`) })
          if (tot > 6000) iss.push(`${p}.strokes total`)
        }
      } else if (b.kind === 'art') {
        if (typeof b.component !== 'string' || b.component.length === 0) iss.push(`${p}.component`)
      }
    })
  }))
  return iss
}
problems.push(...validate(out))

// ── report ─────────────────────────────────────────────────────────────────
const preBoxes = out.pages.reduce((t, pg) => t + pg.panels.reduce((s, p) => s + p.boxes.length, 0), 0)
console.log(`panels: ${out.pages.reduce((t, pg) => t + pg.panels.length, 0)}, boxes: ${preBoxes}`)
if (problems.length) {
  console.log(`\nFAILED (${problems.length}):`)
  problems.forEach((p) => console.log('  - ' + p))
  process.exit(1)
}
if (WRITE) {
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n')
  console.log('wrote', FILE)
} else {
  console.log('(dry run — pass --write to save)')
}
console.log('MIGRATION OK')
