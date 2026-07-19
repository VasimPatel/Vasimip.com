// ─────────────────────────────────────────────────────────────────────────────
// The friend-submission validator.
//
// v1 (legacy): a bare content panel {w, h, boxes} — the original "content only,
// the owner places it" shape. Still accepted; old pending rows still review.
//
// v2 (the guestbook flow): a friend PROPOSES the whole experience —
//   panel:     the same content panel as v1 (text + draw boxes only)
//   placement: where on the current guestbook side it should sit (advisory —
//              approval re-validates and may nudge; the owner can move it)
//   travel:    which builtin travel verbs Dash may use to get there
//   trick:     ONE optional custom Dojo action (same step grammar and caps as
//              the owner's actions — closed verb/sfx/fx sets, ≤32 steps, ≤8s)
//   note:      a short message to the owner
// The security model shifts from "validator rejects placement/behaviour" to
// "owner approval is the gate": everything here is still CLOSED-SET data (no
// components, no flags, no code), and nothing lands in the live doc until the
// owner grafts it (doc/friendPages.ts) and saves.
// ─────────────────────────────────────────────────────────────────────────────
import { ARRIVAL_POSES, BUILTIN_MODES, type ArrivalPose, type BoxDoc, type BuiltinMode, type Step } from './docTypes'
import { checkBox, isPlainObject, isFiniteNumber, oneOf, type Issues } from './checks'
import { tryValidateAction } from './validate'
import { PAGE_W, PAGE_H } from './spread'

/** The content panel: a panel-shaped bundle of text + draw boxes. */
export interface SubmissionPanel {
  w: number
  h: number
  boxes: BoxDoc[]
}

/** The full v2 request (see the header). */
export interface FriendSubmission {
  version: 2
  panel: SubmissionPanel
  placement?: { x: number; y: number }
  travel?: BuiltinMode[]
  trick?: { name: string; steps: Step[] }
  /** What Dash DOES at the panel: a closed-set arrival pose, a short line,
   *  and which way he faces. (No once/setFlag/sfx — those stay owner-only.) */
  arrival?: { pose?: ArrivalPose; say?: string; face?: 1 | -1 }
  note?: string
}

export const MIN_DIM = 120
export const MAX_DIM = 480
const MAX_BOXES = 12
const MAX_SUBMISSION_TEXT = 500
const MAX_NOTE = 200
const MAX_TRICK_SAY = 80
export const TRICK_NAME_RE = /^[a-z0-9][a-z0-9-]{2,23}$/
/** Only these top-level keys are allowed on the content panel. */
const PANEL_KEYS = new Set(['w', 'h', 'boxes'])
const V2_KEYS = new Set(['version', 'panel', 'placement', 'travel', 'trick', 'arrival', 'note'])
const ARRIVAL_KEYS = new Set(['pose', 'say', 'face'])

// ── friend-trick numeric bounds ──────────────────────────────────────────────
// The owner's Dojo validator abandons its 8s duration cap once any speed-based
// move appears (speed durations depend on runtime distance), and leaves most
// numeric fields "any finite number" — fine for the OWNER, abusable from a
// public endpoint (codex: a wait of 1e12ms validated). Friend tricks get hard
// per-field caps plus a PESSIMISTIC total-duration bound: every move costs its
// explicit ms, or worst-case-distance/speed when speed-based.
const TRICK_MAX_STEPS = 16
const TRICK_MAX_MS = 15_000
const TRICK_WORST_DIST = 2100 // the spread's diagonal, generously

function checkTrickBounds(steps: unknown[], issues: Issues): void {
  if (steps.length > TRICK_MAX_STEPS) issues.push(`trick.steps: ${steps.length} steps exceeds the friend cap of ${TRICK_MAX_STEPS}`)
  let worstMs = 0
  steps.forEach((s, i) => {
    if (!isPlainObject(s)) return
    const p = `trick.steps[${i}]`
    const num = (v: unknown): number => (isFiniteNumber(v) ? v : 0)
    switch (s.do) {
      case 'say':
        if (typeof s.text === 'string' && s.text.length > MAX_TRICK_SAY) issues.push(`${p}.text: ${s.text.length} chars exceeds the cap of ${MAX_TRICK_SAY}`)
        if (isFiniteNumber(s.holdMs) && s.holdMs > 3000) issues.push(`${p}.holdMs: must be ≤ 3000`)
        worstMs += Math.min(num(s.holdMs), 3000)
        break
      case 'wait':
        if (isFiniteNumber(s.ms) && s.ms > 3000) issues.push(`${p}.ms: must be ≤ 3000`)
        worstMs += Math.min(num(s.ms), 3000)
        break
      case 'pose':
        if (isFiniteNumber(s.ms) && s.ms > 3000) issues.push(`${p}.ms: must be ≤ 3000`)
        worstMs += Math.min(num(s.ms), 3000)
        break
      case 'move': {
        if (isFiniteNumber(s.ms) && s.ms > 4000) issues.push(`${p}.ms: must be ≤ 4000`)
        if (s.speed !== undefined && isFiniteNumber(s.speed) && (s.speed < 40 || s.speed > 600)) issues.push(`${p}.speed: must be 40..600`)
        if (isPlainObject(s.to)) {
          const t = s.to
          if (t.at === 'offset' && (Math.abs(num(t.dx)) > 1200 || Math.abs(num(t.dy)) > 1200)) issues.push(`${p}.to: offset must stay within ±1200px`)
          if (t.at === 'anchor' && (Math.abs(num(t.dx)) > 400 || Math.abs(num(t.dy)) > 400)) issues.push(`${p}.to: anchor offset must stay within ±400px`)
          if (t.at === 'panelEdge' && (Math.abs(num(t.inset)) > 200 || Math.abs(num(t.dy)) > 400)) issues.push(`${p}.to: edge inset/dy out of range`)
        }
        worstMs += isFiniteNumber(s.ms) ? Math.min(s.ms, 4000) : (TRICK_WORST_DIST / Math.max(40, Math.min(num(s.speed) || 190, 600))) * 1000
        break
      }
      case 'cam':
        if (isFiniteNumber(s.mult) && (s.mult < 0.5 || s.mult > 2)) issues.push(`${p}.mult: must be 0.5..2`)
        if (isPlainObject(s.on) && (num(s.on.cx) < 0 || num(s.on.cx) > 1854 || num(s.on.cy) < 0 || num(s.on.cy) > 660)) issues.push(`${p}.on: cx/cy must be on the stage`)
        break
      default:
        break // sfx / fx / camClear: closed sets, no numerics
    }
  })
  if (worstMs > TRICK_MAX_MS) {
    issues.push(`trick: worst-case duration ~${Math.round(worstMs / 1000)}s exceeds the ${TRICK_MAX_MS / 1000}s cap (shorten waits or speed up moves)`)
  }
}

export function validateSubmissionPanel(x: unknown): { ok: true; panel: SubmissionPanel } | { ok: false; errors: string[] } {
  const issues: Issues = []
  if (!isPlainObject(x)) return { ok: false, errors: ['panel: must be an object'] }

  // Content only: pid, arrival, anchor, x/y/rotate/sketch/showIfFlag… all live
  // OUTSIDE the content panel (v2 carries placement/travel separately).
  for (const k of Object.keys(x)) {
    if (!PANEL_KEYS.has(k)) issues.push(`panel.${k}: not allowed (content only — placement/behaviour ride the v2 envelope)`)
  }

  for (const k of ['w', 'h'] as const) {
    if (!isFiniteNumber(x[k])) {
      issues.push(`panel.${k}: required finite number`)
    } else if (x[k] < MIN_DIM || x[k] > MAX_DIM) {
      issues.push(`panel.${k}: must be between ${MIN_DIM} and ${MAX_DIM} (got ${x[k]})`)
    }
  }

  if (!Array.isArray(x.boxes) || x.boxes.length === 0) {
    issues.push('panel.boxes: required non-empty array')
  } else {
    if (x.boxes.length > MAX_BOXES) issues.push(`panel.boxes: ${x.boxes.length} boxes exceeds the cap of ${MAX_BOXES}`)
    x.boxes.forEach((b, i) => {
      const path = `panel.boxes[${i}]`
      checkBox(b, path, issues, x.w, x.h, {
        kinds: ['text', 'draw'],
        maxTextChars: MAX_SUBMISSION_TEXT,
        allowShowIfFlag: false,
      })
      // Friend-only tightening (codex: the shared checker's ±400px band let a
      // box hide outside the reviewed panel and render elsewhere on the LIVE
      // page; sizes/rotations were unbounded): every box must sit fully inside
      // its panel with sane magnitudes.
      if (isPlainObject(b) && isFiniteNumber(b.x) && isFiniteNumber(b.y) && isFiniteNumber(b.w) && isFiniteNumber(b.h) && isFiniteNumber(x.w) && isFiniteNumber(x.h)) {
        if (b.w <= 0 || b.h <= 0 || b.x < 0 || b.y < 0 || b.x + b.w > x.w || b.y + b.h > x.h) {
          issues.push(`${path}: must sit fully inside the panel (what the owner reviews is what renders)`)
        }
        if (isFiniteNumber(b.rot) && (b.rot < -45 || b.rot > 45)) issues.push(`${path}.rot: must be within ±45°`)
        if (b.kind === 'text' && isFiniteNumber(b.size) && (b.size < 8 || b.size > 64)) issues.push(`${path}.size: must be 8..64`)
        if (b.kind === 'draw' && isFiniteNumber(b.strokeW) && (b.strokeW <= 0 || b.strokeW > 12)) issues.push(`${path}.strokeW: must be 0..12`)
      }
    })
  }

  if (issues.length > 0) return { ok: false, errors: issues }
  return { ok: true, panel: { w: x.w as number, h: x.h as number, boxes: x.boxes as BoxDoc[] } }
}

/** Accept a v2 envelope OR the legacy bare panel (normalized to v2). */
export function validateFriendSubmission(x: unknown): { ok: true; sub: FriendSubmission } | { ok: false; errors: string[] } {
  if (!isPlainObject(x)) return { ok: false, errors: ['submission: must be an object'] }

  // Legacy shape: the bare content panel at the top level.
  if (x.version === undefined && 'boxes' in x) {
    const v1 = validateSubmissionPanel(x)
    if (!v1.ok) return v1
    return { ok: true, sub: { version: 2, panel: v1.panel } }
  }

  const issues: Issues = []
  if (x.version !== 2) return { ok: false, errors: ['version: must be 2 (or the legacy bare panel shape)'] }
  for (const k of Object.keys(x)) {
    if (!V2_KEYS.has(k)) issues.push(`submission.${k}: unknown key`)
  }

  const panelRes = validateSubmissionPanel(x.panel)
  if (!panelRes.ok) issues.push(...panelRes.errors)

  if (x.placement !== undefined) {
    if (!isPlainObject(x.placement) || !isFiniteNumber(x.placement.x) || !isFiniteNumber(x.placement.y)) {
      issues.push('placement: must be { x, y } with finite numbers')
    } else if (panelRes.ok) {
      const { x: px, y: py } = x.placement
      if (px < 0 || py < 0 || px + panelRes.panel.w > PAGE_W || py + panelRes.panel.h > PAGE_H) {
        issues.push(`placement: panel must sit inside the ${PAGE_W}×${PAGE_H} page`)
      }
    }
  }

  if (x.travel !== undefined) {
    if (!Array.isArray(x.travel) || !x.travel.every((m) => oneOf(m, BUILTIN_MODES))) {
      issues.push('travel: must be an array of known builtin modes')
    } else if (new Set(x.travel).size !== x.travel.length) {
      // duplicates would migrate into pool WEIGHTS, not a selection (codex)
      issues.push('travel: no duplicate modes')
    }
  }

  if (x.trick !== undefined) {
    if (!isPlainObject(x.trick)) {
      issues.push('trick: must be { name, steps }')
    } else {
      if (typeof x.trick.name !== 'string' || !TRICK_NAME_RE.test(x.trick.name)) {
        issues.push('trick.name: must be 3-24 chars of a-z, 0-9, and dashes')
      }
      // Same grammar as the owner's Dojo actions (closed verb/sfx/fx sets); no
      // `when` gates on friend tricks.
      const act = tryValidateAction({ steps: x.trick.steps }, String(x.trick.name ?? 'trick'))
      if (!act.ok) issues.push(...act.errors)
      if (Array.isArray(x.trick.steps)) checkTrickBounds(x.trick.steps, issues)
    }
  }

  if (x.arrival !== undefined) {
    if (!isPlainObject(x.arrival)) {
      issues.push('arrival: must be { pose?, say?, face? }')
    } else {
      for (const k of Object.keys(x.arrival)) {
        if (!ARRIVAL_KEYS.has(k)) issues.push(`arrival.${k}: not allowed (once/setFlag/sfx are owner-only)`)
      }
      if (x.arrival.pose !== undefined && !oneOf(x.arrival.pose, ARRIVAL_POSES)) {
        issues.push(`arrival.pose: must be one of ${ARRIVAL_POSES.join('|')}`)
      }
      if (x.arrival.say !== undefined && (typeof x.arrival.say !== 'string' || x.arrival.say.length > MAX_TRICK_SAY)) {
        issues.push(`arrival.say: must be a string of at most ${MAX_TRICK_SAY} chars`)
      }
      if (x.arrival.face !== undefined && x.arrival.face !== 1 && x.arrival.face !== -1) {
        issues.push('arrival.face: must be 1 or -1')
      }
    }
  }

  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > MAX_NOTE)) {
    issues.push(`note: must be a string of at most ${MAX_NOTE} chars`)
  }

  if (issues.length > 0 || !panelRes.ok) return { ok: false, errors: issues }
  const sub: FriendSubmission = { version: 2, panel: panelRes.panel }
  if (isPlainObject(x.placement)) sub.placement = { x: x.placement.x as number, y: x.placement.y as number }
  if (Array.isArray(x.travel) && x.travel.length > 0) sub.travel = x.travel as BuiltinMode[]
  if (isPlainObject(x.trick)) sub.trick = { name: x.trick.name as string, steps: x.trick.steps as Step[] }
  if (isPlainObject(x.arrival)) {
    const a: FriendSubmission['arrival'] = {}
    if (oneOf(x.arrival.pose, ARRIVAL_POSES)) a.pose = x.arrival.pose
    if (typeof x.arrival.say === 'string' && x.arrival.say.trim()) a.say = x.arrival.say.trim()
    if (x.arrival.face === 1 || x.arrival.face === -1) a.face = x.arrival.face
    if (Object.keys(a).length > 0) sub.arrival = a
  }
  if (typeof x.note === 'string' && x.note.trim()) sub.note = x.note.trim()
  return { ok: true, sub }
}

/** Read a STORED submission row's payload (either era) as a v2 envelope. */
export function normalizeSubmission(x: unknown): FriendSubmission | null {
  const res = validateFriendSubmission(x)
  return res.ok ? res.sub : null
}
