// ─────────────────────────────────────────────────────────────────────────────
// The friend-submission validator. A submission is PURE CONTENT — a panel-shaped
// bundle of text + draw boxes the owner will later place. It deliberately rejects
// everything that belongs to placement/behaviour (art boxes, showIfFlag, pid,
// arrival, travel, anchor, position/rotation/sketch) so a stranger can never inject
// registry components, gate on flags, or dictate where/how their panel lands.
//
// Reuses the shared `checkBox` (checks.ts) with a stricter option set so the box
// rules stay in lock-step with the full-doc validator.
// ─────────────────────────────────────────────────────────────────────────────
import type { BoxDoc } from './docTypes'
import { checkBox, isPlainObject, isFiniteNumber, type Issues } from './checks'

/** What a stranger may submit: a bare panel of content, no placement metadata. */
export interface SubmissionPanel {
  w: number
  h: number
  boxes: BoxDoc[]
}

const MIN_DIM = 120
const MAX_DIM = 480
const MAX_BOXES = 12
const MAX_SUBMISSION_TEXT = 500
/** Only these top-level keys are allowed — anything else is placement/behaviour. */
const ALLOWED_KEYS = new Set(['w', 'h', 'boxes'])

export function validateSubmissionPanel(x: unknown): { ok: true; panel: SubmissionPanel } | { ok: false; errors: string[] } {
  const issues: Issues = []
  if (!isPlainObject(x)) return { ok: false, errors: ['panel: must be an object'] }

  // Reject placement/behaviour fields outright (pid, arrival, travel, anchor,
  // x/y/rotate/sketch/showIfFlag, …) — a submission is content only.
  for (const k of Object.keys(x)) {
    if (!ALLOWED_KEYS.has(k)) issues.push(`panel.${k}: not allowed in a submission (content only — the owner places it)`)
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
    x.boxes.forEach((b, i) => checkBox(b, `panel.boxes[${i}]`, issues, x.w, x.h, {
      kinds: ['text', 'draw'],
      maxTextChars: MAX_SUBMISSION_TEXT,
      allowShowIfFlag: false,
    }))
  }

  if (issues.length > 0) return { ok: false, errors: issues }
  return { ok: true, panel: { w: x.w as number, h: x.h as number, boxes: x.boxes as BoxDoc[] } }
}
