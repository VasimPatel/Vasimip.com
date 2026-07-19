// ─────────────────────────────────────────────────────────────────────────────
// Pen-stroke capture helpers, shared by the admin PageCanvas and the friend
// builder. Fixes two things about the old inline capture (owner-reported):
//
//  SILENT FIFO LOSS — both canvases used to trim the OLDEST strokes once a box
//  hit the validator caps (64 strokes / 6000 path chars). Committing now goes
//  through `fitsBudget`: a stroke that doesn't fit is REJECTED (callers show
//  the ink meter / a message), and nothing already drawn is ever deleted.
//
//  RAW-POLYLINE BLOAT — points were serialized raw (~11 chars each, ~2px
//  apart), so a few long strokes ate the whole budget and capture just stopped
//  mid-stroke at a fixed char cap. Strokes are now simplified (Ramer–Douglas–
//  Peucker) and smoothed (quadratic midpoint curves), which reads BETTER at
//  doodle scale and costs ~4× less budget for the same drawing.
//
// Pure math + strings — no DOM. The emitted path grammar stays inside
// checks.ts's PATH_D_RE (M/L/Q + numbers), so validators are untouched.
// ─────────────────────────────────────────────────────────────────────────────
import { MAX_STROKES, MAX_PATH_CHARS } from './checks'

export interface Pt {
  x: number
  y: number
}

/** Perpendicular distance from p to the segment a→b. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Ramer–Douglas–Peucker simplification (iterative, stack-based). */
export function simplify(points: readonly Pt[], tolerance = 1.5): Pt[] {
  if (points.length <= 2) return [...points]
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    let maxD = 0
    let maxI = -1
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i], points[a], points[b])
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxD > tolerance && maxI > 0) {
      keep[maxI] = true
      stack.push([a, maxI], [maxI, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

const n1 = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** Serialize simplified points as a SMOOTH path: quadratic curves through
 *  segment midpoints (the classic freehand-smoothing shape), 1-decimal
 *  coordinates. Two points fall back to a line; one point becomes a dot-able
 *  zero-length line (round caps render it). */
export function toSmoothPath(pts: readonly Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${n1(pts[0].x)},${n1(pts[0].y)} L${n1(pts[0].x)},${n1(pts[0].y)}`
  if (pts.length === 2) return `M${n1(pts[0].x)},${n1(pts[0].y)} L${n1(pts[1].x)},${n1(pts[1].y)}`
  let d = `M${n1(pts[0].x)},${n1(pts[0].y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${n1(pts[i].x)},${n1(pts[i].y)} ${n1(mx)},${n1(my)}`
  }
  const last = pts[pts.length - 1]
  d += ` L${n1(last.x)},${n1(last.y)}`
  return d
}

/** Capture → committable path: simplify then smooth. */
export function finishStroke(points: readonly Pt[], tolerance = 1.5): string {
  return toSmoothPath(simplify(points, tolerance))
}

/** A box's ink accounting against the validator caps. */
export function inkBudget(strokes: readonly string[]): { chars: number; maxChars: number; strokes: number; maxStrokes: number; frac: number } {
  const chars = strokes.reduce((n, s) => n + s.length, 0)
  return {
    chars,
    maxChars: MAX_PATH_CHARS,
    strokes: strokes.length,
    maxStrokes: MAX_STROKES,
    frac: Math.max(chars / MAX_PATH_CHARS, strokes.length / MAX_STROKES),
  }
}

/** Would adding `d` keep the box inside the validator caps? */
export function fitsBudget(strokes: readonly string[], d: string): boolean {
  const b = inkBudget(strokes)
  return b.strokes + 1 <= b.maxStrokes && b.chars + d.length <= b.maxChars
}

/** All coordinate pairs in a committed path (for eraser hit-testing). */
export function pathPoints(d: string): Pt[] {
  const out: Pt[] = []
  const re = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) out.push({ x: Number(m[1]), y: Number(m[2]) })
  return out
}

/** Index of the stroke nearest (x,y) within `radius`, topmost (latest) first;
 *  -1 when nothing is close enough. Segment-aware so long straight strokes
 *  hit anywhere along their length, not only at stored points. */
export function strokeAt(strokes: readonly string[], x: number, y: number, radius = 10): number {
  const p = { x, y }
  for (let i = strokes.length - 1; i >= 0; i--) {
    const pts = pathPoints(strokes[i])
    if (pts.length === 1 && Math.hypot(pts[0].x - x, pts[0].y - y) <= radius) return i
    for (let j = 0; j + 1 < pts.length; j++) {
      if (segDist(p, pts[j], pts[j + 1]) <= radius) return i
    }
  }
  return -1
}
