// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive checkers + the box-level validator. Extracted from validate.ts
// so BOTH the full-doc validator (validate.ts) and the friend-submission validator
// (submission.ts) enforce the SAME box rules. `checkBox`'s default options
// reproduce validate.ts's original behaviour byte-for-byte; submission.ts passes a
// stricter option set (text+draw only, tighter text cap, no showIfFlag).
// ─────────────────────────────────────────────────────────────────────────────
import { BOX_KINDS, FAM_VALUES, type BoxKind } from './docTypes'

export const MAX_TEXT_CHARS = 2000
export const MAX_STROKES = 64
export const MAX_PATH_CHARS = 6000
/** How far (px) a box may stray beyond its panel's rect before it's flagged. */
export const BOX_BAND = 400
export const PATH_D_RE = /^[MLQCZmlqcz0-9 ,.\-]+$/

export type Issues = string[]

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

export function oneOf<T extends string>(x: unknown, allowed: readonly T[]): x is T {
  return typeof x === 'string' && (allowed as readonly string[]).includes(x)
}

export interface BoxCheckOpts {
  /** Which box kinds are permitted (default: all three). */
  kinds?: readonly BoxKind[]
  /** Cap on a text box's character count (default MAX_TEXT_CHARS). */
  maxTextChars?: number
  /** When false, ANY `showIfFlag` is rejected (submissions can't gate on flags). */
  allowShowIfFlag?: boolean
}

/** Validate one box; pushes every problem onto `issues`, prefixed with `path`.
 *  With no opts this is identical to validate.ts's original box check. */
export function checkBox(x: unknown, path: string, issues: Issues, panelW: unknown, panelH: unknown, opts: BoxCheckOpts = {}): void {
  const kinds = opts.kinds ?? BOX_KINDS
  const maxTextChars = opts.maxTextChars ?? MAX_TEXT_CHARS
  const allowShowIfFlag = opts.allowShowIfFlag ?? true

  if (!isPlainObject(x)) { issues.push(`${path}: box must be an object`); return }
  if (!oneOf(x.kind, kinds)) { issues.push(`${path}.kind: unknown box kind ${JSON.stringify(x.kind)}`); return }

  // Geometry: finite, and within a generous band around the panel's rect.
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (!isFiniteNumber(x[k])) issues.push(`${path}.${k}: required finite number`)
  }
  if (isFiniteNumber(x.x) && isFiniteNumber(x.y) && isFiniteNumber(panelW) && isFiniteNumber(panelH)) {
    if (x.x < -BOX_BAND || x.x > panelW + BOX_BAND || x.y < -BOX_BAND || x.y > panelH + BOX_BAND) {
      issues.push(`${path}: strayed too far from its panel (x ${x.x}, y ${x.y})`)
    }
  }
  if (x.rot !== undefined && !isFiniteNumber(x.rot)) issues.push(`${path}.rot: must be a finite number`)
  if (x.showIfFlag !== undefined) {
    if (!allowShowIfFlag) issues.push(`${path}.showIfFlag: not allowed in a submission`)
    else if (typeof x.showIfFlag !== 'string') issues.push(`${path}.showIfFlag: must be a string`)
  }

  switch (x.kind) {
    case 'text': {
      if (typeof x.text !== 'string') { issues.push(`${path}.text: required string`); break }
      if (x.text.length > maxTextChars) issues.push(`${path}.text: ${x.text.length} chars exceeds the cap of ${maxTextChars}`)
      if (x.fam !== undefined && !oneOf(x.fam, FAM_VALUES)) issues.push(`${path}.fam: unknown family ${JSON.stringify(x.fam)}`)
      if (x.size !== undefined && !isFiniteNumber(x.size)) issues.push(`${path}.size: must be a finite number`)
      if (x.color !== undefined && typeof x.color !== 'string') issues.push(`${path}.color: must be a string`)
      if (x.hl !== undefined && !oneOf(x.hl, ['yellow', 'pink'])) issues.push(`${path}.hl: must be 'yellow' or 'pink'`)
      if (x.note !== undefined && typeof x.note !== 'boolean') issues.push(`${path}.note: must be a boolean`)
      if (x.charRots !== undefined) {
        if (!Array.isArray(x.charRots)) {
          issues.push(`${path}.charRots: must be an array`)
        } else {
          const nonSpace = (x.text.match(/\S/g) ?? []).length
          if (x.charRots.length > nonSpace) issues.push(`${path}.charRots: length ${x.charRots.length} exceeds non-space char count ${nonSpace}`)
          x.charRots.forEach((r, i) => {
            if (r === null) return
            if (!isFiniteNumber(r) || r < -45 || r > 45) issues.push(`${path}.charRots[${i}]: must be null or a number in [-45, 45]`)
          })
        }
      }
      break
    }
    case 'draw': {
      if (x.strokeColor !== undefined && typeof x.strokeColor !== 'string') issues.push(`${path}.strokeColor: must be a string`)
      if (x.strokeW !== undefined && !isFiniteNumber(x.strokeW)) issues.push(`${path}.strokeW: must be a finite number`)
      if (!Array.isArray(x.strokes)) { issues.push(`${path}.strokes: required array of path strings`); break }
      if (x.strokes.length > MAX_STROKES) issues.push(`${path}.strokes: ${x.strokes.length} strokes exceeds the cap of ${MAX_STROKES}`)
      let total = 0
      x.strokes.forEach((d, i) => {
        if (typeof d !== 'string') { issues.push(`${path}.strokes[${i}]: must be a string`); return }
        total += d.length
        if (!PATH_D_RE.test(d)) issues.push(`${path}.strokes[${i}]: contains characters outside the allowed path grammar`)
      })
      if (total > MAX_PATH_CHARS) issues.push(`${path}.strokes: ${total} total path chars exceeds the cap of ${MAX_PATH_CHARS}`)
      break
    }
    case 'art':
      if (typeof x.component !== 'string' || x.component.length === 0) issues.push(`${path}.component: required non-empty string`)
      if (x.props !== undefined && !isPlainObject(x.props)) issues.push(`${path}.props: must be an object`)
      break
  }
}
