// Skin docs (L1c — parity recovery, Stage 2b; owner-approved Decision 1:
// "expressive data skin"). The legacy site's charm lives in hand-drawn per-pose
// SVG art with named CSS keyframe animations on sub-groups (a sword arm that
// jabs, legs that scramble). Those drawings share NO skeleton — each pose
// re-authors its coordinates — so a skin is a WHOLE-FIGURE authored vector
// group in the legacy Dash local space (viewBox -60 -75 120 130; feet at
// (0, 55), width 104 × height 113 on screen), swapped per active pose/clip,
// exactly as the legacy React component swap did.
//
// The engine stays authoritative for root position, facing, physics, behaviors,
// squash/lean/spin; the renderer maps skin-local → world under those transforms.
// Engine-owned charm is EXCLUDED from skin data by convention: the verlet cape
// (legacy cape path is dropped at extraction) and the parametric face (eyes/
// brows/mouth — the skin carries only a `head` anchor the face rides).
//
// Two doc kinds:
//   SkinKeyframesDoc — the shared animation table (styles.css keyframes AS DATA;
//                      the renderer synthesizes one <style> block from it).
//   PoseSkinDoc      — one drawing: ordered elements (paths/circles/ellipses/
//                      rects and animated groups), a head anchor, an optional
//                      whole-figure animation, and the pose/clip ids it skins.

import { tryValidate, isRecord, isNum, isStr, isArr, type Check, type Issues, type ValidateResult } from './validate'

// ── keyframes as data ─────────────────────────────────────────────────────────

/** One keyframe stop: a transform (applied in translate→rotate→scale order) and/or
 * opacity. Units: px (translate), degrees (rotate), unitless (scale). */
export interface SkinFrame {
  translate?: [number, number]
  rotate?: number
  scale?: [number, number]
  opacity?: number
}

export interface SkinKeyframe {
  /** Duration in SECONDS (matches the legacy css shorthand values). */
  duration: number
  /** CSS timing function (default 'ease-in-out' — the legacy css default used most). */
  ease?: string
  /** iteration count: 'infinite' (default — idle loops) or a positive integer. */
  iterations?: 'infinite' | number
  /** 'forwards' fill (one-shot arcs like windup); default none for loops. */
  fill?: 'forwards'
  /** offset percentage ('0'..'100') → frame. */
  frames: Record<string, SkinFrame>
}

export interface SkinKeyframesDoc {
  schemaVersion: number
  id: string
  keyframes: Record<string, SkinKeyframe>
}

// ── skin elements ─────────────────────────────────────────────────────────────

interface SkinPaint {
  fill?: string
  stroke?: string
  strokeWidth?: number
  linecap?: 'round' | 'butt' | 'square'
  opacity?: number
}

export type SkinElement =
  | ({ kind: 'path'; d: string } & SkinPaint)
  | ({ kind: 'circle'; cx: number; cy: number; r: number } & SkinPaint)
  | ({ kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & SkinPaint)
  | ({ kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & SkinPaint)
  | {
      kind: 'group'
      /** Animation by NAME into the shared keyframes table. */
      anim?: { name: string; delaySec?: number }
      /** transform-origin, verbatim from the legacy art (e.g. '6px -20px' or
       * '50% 88%'); percentage origins resolve against the group's fill-box. */
      origin?: string
      /** A STATIC transform (legacy rotated wallrun/vault bodies), CSS syntax. */
      transform?: string
      children: SkinElement[]
    }

export interface PoseSkinDoc {
  schemaVersion: number
  /** 'skin:<name>' */
  id: string
  /** The pose/clip ids this drawing skins (e.g. ['fight'] or ['walk-cycle']). */
  sources: string[]
  /** Head anchor in skin-local px — the engine's parametric face rides it. */
  head?: { cx: number; cy: number; r: number }
  /** 'baked' (default): the drawing carries its own eyes/mouth — the parametric
   * face hides (legacy action poses: grit mouths, focus squints ARE the art).
   * 'parametric': the drawing omits the face and the engine face (pupil dilation,
   * blink, look-at, brows) renders on the head anchor (the idle/stand skins). */
  face?: 'baked' | 'parametric'
  /** Authored stride distance in px (quality Q1): when present, EVERY keyframe
   * animation in this skin is PHASE-DRIVEN — the renderer sets animation time
   * from traveled-distance / strideLen instead of wall-clock, locking contact
   * beats to world motion (the walk skin). Absent → decorative wall-clock. */
  strideLen?: number
  /** Whole-figure animation (legacy top-group anims like fightshift/idlesway). */
  groupAnim?: { name: string; delaySec?: number; origin?: string }
  elements: SkinElement[]
}

// ── validation ────────────────────────────────────────────────────────────────

// Closed shapes (review: open skin schemas let typoed fields validate silently).
const FRAME_KEYS = new Set(['translate', 'rotate', 'scale', 'opacity'])
const KEYFRAME_KEYS = new Set(['duration', 'ease', 'iterations', 'fill', 'frames'])
const KEYFRAMES_DOC_KEYS = new Set(['schemaVersion', 'id', 'keyframes'])
const POSE_SKIN_KEYS = new Set(['schemaVersion', 'id', 'sources', 'head', 'face', 'groupAnim', 'elements', 'strideLen'])
const HEAD_KEYS = new Set(['cx', 'cy', 'r'])
const GROUP_ANIM_KEYS = new Set(['name', 'delaySec', 'origin'])
const PAINT_KEYS = ['fill', 'stroke', 'strokeWidth', 'linecap', 'opacity']
const ELEMENT_KEYS: Record<string, Set<string>> = {
  path: new Set(['kind', 'd', ...PAINT_KEYS]),
  circle: new Set(['kind', 'cx', 'cy', 'r', ...PAINT_KEYS]),
  ellipse: new Set(['kind', 'cx', 'cy', 'rx', 'ry', ...PAINT_KEYS]),
  rect: new Set(['kind', 'x', 'y', 'w', 'h', 'rx', ...PAINT_KEYS]),
  group: new Set(['kind', 'anim', 'origin', 'transform', 'children']),
}

function rejectUnknown(obj: Record<string, unknown>, allowed: Set<string>, path: string, issues: Issues): void {
  for (const k of Object.keys(obj)) if (!allowed.has(k)) issues.push(`${path}.${k}: unknown key`)
}

function checkFrame(f: unknown, path: string, issues: Issues): void {
  if (!isRecord(f)) return void issues.push(`${path}: must be an object`)
  for (const k of Object.keys(f)) if (!FRAME_KEYS.has(k)) issues.push(`${path}.${k}: unknown key`)
  if (f.translate !== undefined && (!isArr(f.translate) || f.translate.length !== 2 || !isNum(f.translate[0]) || !isNum(f.translate[1])))
    issues.push(`${path}.translate: must be [number, number]`)
  if (f.rotate !== undefined && !isNum(f.rotate)) issues.push(`${path}.rotate: must be a number (degrees)`)
  if (f.scale !== undefined && (!isArr(f.scale) || f.scale.length !== 2 || !isNum(f.scale[0]) || !isNum(f.scale[1])))
    issues.push(`${path}.scale: must be [number, number]`)
  if (f.opacity !== undefined && (!isNum(f.opacity) || f.opacity < 0 || f.opacity > 1))
    issues.push(`${path}.opacity: must be in [0, 1]`)
}

function checkKeyframe(k: unknown, path: string, issues: Issues): void {
  if (!isRecord(k)) return void issues.push(`${path}: must be an object`)
  rejectUnknown(k, KEYFRAME_KEYS, path, issues)
  if (!isNum(k.duration) || k.duration <= 0) issues.push(`${path}.duration: required seconds > 0`)
  if (k.ease !== undefined && !isStr(k.ease)) issues.push(`${path}.ease: must be a string`)
  if (k.iterations !== undefined && k.iterations !== 'infinite' && (!isNum(k.iterations) || k.iterations <= 0 || !Number.isInteger(k.iterations)))
    issues.push(`${path}.iterations: must be 'infinite' or a positive integer`)
  if (k.fill !== undefined && k.fill !== 'forwards') issues.push(`${path}.fill: must be 'forwards' when present`)
  if (!isRecord(k.frames) || Object.keys(k.frames).length === 0) {
    issues.push(`${path}.frames: required non-empty record of offset% → frame`)
    return
  }
  for (const [off, frame] of Object.entries(k.frames)) {
    const n = Number(off)
    if (!Number.isFinite(n) || n < 0 || n > 100) issues.push(`${path}.frames['${off}']: offset must be 0..100`)
    checkFrame(frame, `${path}.frames['${off}']`, issues)
  }
}

function checkPaint(e: Record<string, unknown>, path: string, issues: Issues): void {
  if (e.fill !== undefined && !isStr(e.fill)) issues.push(`${path}.fill: must be a string`)
  if (e.stroke !== undefined && !isStr(e.stroke)) issues.push(`${path}.stroke: must be a string`)
  if (e.strokeWidth !== undefined && (!isNum(e.strokeWidth) || e.strokeWidth < 0)) issues.push(`${path}.strokeWidth: must be >= 0`)
  if (e.linecap !== undefined && e.linecap !== 'round' && e.linecap !== 'butt' && e.linecap !== 'square')
    issues.push(`${path}.linecap: must be round|butt|square`)
  if (e.opacity !== undefined && (!isNum(e.opacity) || e.opacity < 0 || e.opacity > 1)) issues.push(`${path}.opacity: must be in [0, 1]`)
}

function checkElement(e: unknown, path: string, issues: Issues, depth: number): void {
  if (!isRecord(e)) return void issues.push(`${path}: must be an object`)
  if (typeof e.kind === 'string' && ELEMENT_KEYS[e.kind]) rejectUnknown(e, ELEMENT_KEYS[e.kind], path, issues)
  switch (e.kind) {
    case 'path':
      if (!isStr(e.d) || e.d.length === 0) issues.push(`${path}.d: required non-empty string`)
      checkPaint(e, path, issues)
      break
    case 'circle':
      if (!isNum(e.cx) || !isNum(e.cy) || !isNum(e.r) || (e.r as number) < 0) issues.push(`${path}: cx/cy/r required numbers (r >= 0)`)
      checkPaint(e, path, issues)
      break
    case 'ellipse':
      if (!isNum(e.cx) || !isNum(e.cy) || !isNum(e.rx) || !isNum(e.ry)) issues.push(`${path}: cx/cy/rx/ry required numbers`)
      checkPaint(e, path, issues)
      break
    case 'rect':
      if (!isNum(e.x) || !isNum(e.y) || !isNum(e.w) || !isNum(e.h)) issues.push(`${path}: x/y/w/h required numbers`)
      if (e.rx !== undefined && !isNum(e.rx)) issues.push(`${path}.rx: must be a number`)
      checkPaint(e, path, issues)
      break
    case 'group': {
      if (depth >= 6) return void issues.push(`${path}: group nesting too deep (max 6)`)
      if (e.anim !== undefined) {
        if (!isRecord(e.anim) || !isStr(e.anim.name) || (e.anim.name as string).length === 0)
          issues.push(`${path}.anim: must be { name: string, delaySec? }`)
        else if (e.anim.delaySec !== undefined && !isNum(e.anim.delaySec)) issues.push(`${path}.anim.delaySec: must be a number`)
      }
      if (e.origin !== undefined && !isStr(e.origin)) issues.push(`${path}.origin: must be a string`)
      if (e.transform !== undefined && !isStr(e.transform)) issues.push(`${path}.transform: must be a string`)
      if (!isArr(e.children)) issues.push(`${path}.children: required array`)
      else e.children.forEach((c, i) => checkElement(c, `${path}.children[${i}]`, issues, depth + 1))
      break
    }
    default:
      issues.push(`${path}.kind: must be path|circle|ellipse|rect|group`)
  }
}

const keyframesChecks: Check[] = [
  (doc, issues) => {
    rejectUnknown(doc, KEYFRAMES_DOC_KEYS, 'doc', issues)
    if (doc.schemaVersion !== 2) issues.push('schemaVersion: must be 2')
    if (!isStr(doc.id) || doc.id.length === 0) issues.push('id: required non-empty string')
    if (!isRecord(doc.keyframes)) return void issues.push('keyframes: required record')
    for (const [name, k] of Object.entries(doc.keyframes)) {
      if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) issues.push(`keyframes['${name}']: name must be a CSS identifier`)
      checkKeyframe(k, `keyframes['${name}']`, issues)
    }
  },
]

const poseSkinChecks: Check[] = [
  (doc, issues) => {
    rejectUnknown(doc, POSE_SKIN_KEYS, 'doc', issues)
    if (doc.schemaVersion !== 2) issues.push('schemaVersion: must be 2')
    if (!isStr(doc.id) || !(doc.id as string).startsWith('skin:')) issues.push("id: required, must start with 'skin:'")
    if (!isArr(doc.sources) || doc.sources.length === 0 || !(doc.sources as unknown[]).every((s) => isStr(s) && s.length > 0))
      issues.push('sources: required non-empty array of pose/clip ids')
    if (doc.head !== undefined) {
      const h = doc.head
      if (!isRecord(h) || !isNum(h.cx) || !isNum(h.cy) || !isNum(h.r) || (h.r as number) <= 0)
        issues.push('head: must be { cx, cy, r } with r > 0')
      else rejectUnknown(h, HEAD_KEYS, 'head', issues)
    }
    if (doc.face !== undefined && doc.face !== 'baked' && doc.face !== 'parametric')
      issues.push("face: must be 'baked' or 'parametric' when present")
    if (doc.strideLen !== undefined && (!isNum(doc.strideLen) || doc.strideLen <= 0))
      issues.push('strideLen: must be a finite number > 0 when present')
    if (doc.groupAnim !== undefined) {
      const g = doc.groupAnim
      if (!isRecord(g) || !isStr(g.name)) issues.push('groupAnim: must be { name, delaySec?, origin? }')
      else {
        rejectUnknown(g, GROUP_ANIM_KEYS, 'groupAnim', issues)
        if (g.delaySec !== undefined && !isNum(g.delaySec)) issues.push('groupAnim.delaySec: must be a number')
        if (g.origin !== undefined && !isStr(g.origin)) issues.push('groupAnim.origin: must be a string')
      }
    }
    if (!isArr(doc.elements) || doc.elements.length === 0) issues.push('elements: required non-empty array')
    else doc.elements.forEach((e, i) => checkElement(e, `elements[${i}]`, issues, 0))
  },
]

export function tryValidateSkinKeyframes(doc: unknown): ValidateResult<SkinKeyframesDoc> {
  if (!isRecord(doc)) return { ok: false, errors: ['document: must be an object'] }
  return tryValidate<SkinKeyframesDoc>(doc, keyframesChecks)
}

export function tryValidatePoseSkin(doc: unknown): ValidateResult<PoseSkinDoc> {
  if (!isRecord(doc)) return { ok: false, errors: ['document: must be an object'] }
  return tryValidate<PoseSkinDoc>(doc, poseSkinChecks)
}

/** Every animation a skin references must exist in the shared keyframes table. */
export function validateSkinAgainstKeyframes(skin: PoseSkinDoc, table: SkinKeyframesDoc): string[] {
  const issues: string[] = []
  const known = new Set(Object.keys(table.keyframes))
  const visit = (e: SkinElement, path: string): void => {
    if (e.kind !== 'group') return
    if (e.anim && !known.has(e.anim.name)) issues.push(`${path}.anim: unknown keyframe '${e.anim.name}'`)
    e.children.forEach((c, i) => visit(c, `${path}.children[${i}]`))
  }
  if (skin.groupAnim && !known.has(skin.groupAnim.name)) issues.push(`groupAnim: unknown keyframe '${skin.groupAnim.name}'`)
  skin.elements.forEach((e, i) => visit(e, `elements[${i}]`))
  return issues
}
