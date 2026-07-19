// ─────────────────────────────────────────────────────────────────────────────
// Hand-rolled validator for NotebookDoc (no zod / new deps). Collects EVERY
// problem it finds (rather than bailing on the first) so authoring mistakes
// surface all at once — important once the admin portal (Part 5) starts
// POSTing hand-edited docs.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ARRIVAL_POSES, BUILTIN_MODES, STEP_KINDS, FX_KINDS, EASE_NAMES, SFX_KINDS, POSES, SKETCH_RADII,
} from './docTypes'
import type {
  NotebookDoc, CoverDoc, PageDoc, PanelDoc, ArrivalDoc, BoxDoc, ActionDoc, ActionWhen, Step, MoveTarget, TravelConfig,
} from './docTypes'
import { checkBox, isPlainObject, isFiniteNumber, oneOf, type Issues } from './checks'

// 24 (was 12): the guestbook grows sheets as friend panels arrive (friendPages.ts
// checks this cap before growing, so a graft can never produce an invalid doc).
export const MAX_PAGES = 24
const MAX_STEPS = 32
const MAX_ACTION_MS = 8000
const MAX_PID_CHARS = 24

// ── field checkers (push problems onto `issues`, prefixed with `path`) ─────
// `checkBox` lives in ./checks (shared with the friend-submission validator).

function checkArrival(x: unknown, path: string, issues: Issues): void {
  if (x === undefined) return
  if (!isPlainObject(x)) { issues.push(`${path}: arrival must be an object`); return }
  if (x.pose !== undefined && !oneOf(x.pose, ARRIVAL_POSES)) issues.push(`${path}.pose: unknown arrival pose ${JSON.stringify(x.pose)}`)
  if (x.face !== undefined && x.face !== 1 && x.face !== -1) issues.push(`${path}.face: must be 1 or -1`)
  if (x.once !== undefined && typeof x.once !== 'boolean') issues.push(`${path}.once: must be a boolean`)
  if (x.once === true && typeof x.setFlag !== 'string') issues.push(`${path}.once: requires setFlag (one-shot state is tracked via the flag)`)
  if (x.revertMs !== undefined && (!isFiniteNumber(x.revertMs) || x.revertMs < 0)) issues.push(`${path}.revertMs: must be a non-negative finite number`)
  if (x.say !== undefined && typeof x.say !== 'string') issues.push(`${path}.say: must be a string`)
  if (x.sfx !== undefined && !oneOf(x.sfx, SFX_KINDS)) issues.push(`${path}.sfx: unknown sfx kind ${JSON.stringify(x.sfx)}`)
  if (x.setFlag !== undefined && typeof x.setFlag !== 'string') issues.push(`${path}.setFlag: must be a string`)
  if (x.flourish !== undefined && typeof x.flourish !== 'boolean') issues.push(`${path}.flourish: must be a boolean`)
}

function checkTravelConfig(x: unknown, path: string, issues: Issues, actionNames: Set<string> | null): void {
  if (x === undefined) return
  if (!isPlainObject(x)) { issues.push(`${path}: travel must be an object`); return }
  if (x.builtins !== undefined) {
    if (!Array.isArray(x.builtins) || !x.builtins.every((m) => oneOf(m, BUILTIN_MODES))) issues.push(`${path}.builtins: must be an array of known builtin modes`)
  }
  if (x.actions !== undefined) {
    if (!Array.isArray(x.actions) || !x.actions.every((a) => typeof a === 'string')) {
      issues.push(`${path}.actions: must be a string array`)
    } else if (actionNames) {
      for (const name of x.actions as string[]) {
        if (!actionNames.has(name)) issues.push(`${path}.actions: references unknown action ${JSON.stringify(name)}`)
      }
    }
  }
  if (x.actionWeight !== undefined && !isFiniteNumber(x.actionWeight)) issues.push(`${path}.actionWeight: must be a finite number`)
}

function checkPanel(x: unknown, path: string, issues: Issues, actionNames: Set<string> | null): void {
  if (!isPlainObject(x)) { issues.push(`${path}: panel must be an object`); return }
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    if (!isFiniteNumber(x[k])) issues.push(`${path}.${k}: required finite number`)
  }
  if (!isPlainObject(x.anchor) || !isFiniteNumber(x.anchor.dx) || !isFiniteNumber(x.anchor.dy)) {
    issues.push(`${path}.anchor: required { dx, dy } with finite numbers`)
  } else if (isFiniteNumber(x.w) && isFiniteNumber(x.h)) {
    const { dx, dy } = x.anchor
    if (dx < -200 || dx > x.w + 200 || dy < -200 || dy > x.h + 200) {
      issues.push(`${path}.anchor: strayed too far from its panel (dx ${dx}, dy ${dy})`)
    }
  }
  checkArrival(x.arrival, `${path}.arrival`, issues)
  checkTravelConfig(x.travel, `${path}.travel`, issues, actionNames)
  if (x.rotate !== undefined && !isFiniteNumber(x.rotate)) issues.push(`${path}.rotate: must be a finite number`)
  if (x.sketch !== undefined && !(typeof x.sketch === 'string' && x.sketch in SKETCH_RADII)) issues.push(`${path}.sketch: unknown sketch variant ${JSON.stringify(x.sketch)}`)
  if (x.pid !== undefined && (typeof x.pid !== 'string' || x.pid.length > MAX_PID_CHARS)) issues.push(`${path}.pid: must be a string of at most ${MAX_PID_CHARS} chars`)
  if (!Array.isArray(x.boxes) || x.boxes.length === 0) {
    issues.push(`${path}.boxes: required non-empty array`)
  } else {
    x.boxes.forEach((b, i) => checkBox(b, `${path}.boxes[${i}]`, issues, x.w, x.h))
  }
}

function checkPage(x: unknown, path: string, issues: Issues, actionNames: Set<string> | null): void {
  if (!isPlainObject(x)) { issues.push(`${path}: page must be an object`); return }
  if (typeof x.name !== 'string' || x.name.length === 0) issues.push(`${path}.name: required non-empty string`)
  if (typeof x.snark !== 'string') issues.push(`${path}.snark: required string`)
  checkTravelConfig(x.travel, `${path}.travel`, issues, actionNames)
  if (x.guest !== undefined && x.guest !== true) issues.push(`${path}.guest: only \`true\` is meaningful (omit otherwise)`)
  if (!Array.isArray(x.panels) || x.panels.length === 0) {
    issues.push(`${path}.panels: required non-empty array (>=1 panel)`)
  } else {
    x.panels.forEach((pnl, i) => checkPanel(pnl, `${path}.panels[${i}]`, issues, actionNames))
  }
  // the sheet's BACK (two-sided book): optional; may be empty (blank left page)
  if (x.back !== undefined) {
    if (!isPlainObject(x.back) || !Array.isArray((x.back as { panels?: unknown }).panels)) {
      issues.push(`${path}.back: must be an object { panels: PanelDoc[] }`)
    } else {
      ;(x.back as { panels: unknown[] }).panels.forEach((pnl, i) => checkPanel(pnl, `${path}.back.panels[${i}]`, issues, actionNames))
    }
  }
}

function checkCover(x: unknown, path: string, issues: Issues): void {
  if (!isPlainObject(x)) { issues.push(`${path}: cover must be an object`); return }
  if (typeof x.name !== 'string' || x.name.length === 0) issues.push(`${path}.name: required non-empty string`)
  if (typeof x.subject !== 'string' || x.subject.length === 0) issues.push(`${path}.subject: required non-empty string`)
  if (typeof x.snark !== 'string') issues.push(`${path}.snark: required string`)
}

function checkMoveTarget(x: unknown, path: string, issues: Issues): void {
  if (!isPlainObject(x)) { issues.push(`${path}: move target must be an object`); return }
  if (x.at === 'anchor') {
    if (x.dx !== undefined && !isFiniteNumber(x.dx)) issues.push(`${path}.dx: must be a finite number`)
    if (x.dy !== undefined && !isFiniteNumber(x.dy)) issues.push(`${path}.dy: must be a finite number`)
  } else if (x.at === 'offset') {
    if (!isFiniteNumber(x.dx)) issues.push(`${path}.dx: required finite number`)
    if (!isFiniteNumber(x.dy)) issues.push(`${path}.dy: required finite number`)
  } else if (x.at === 'panelEdge') {
    if (!oneOf(x.panel, ['from', 'to'])) issues.push(`${path}.panel: must be 'from' or 'to'`)
    if (!oneOf(x.side, ['near', 'far', 'left', 'right', 'top', 'bottom'])) issues.push(`${path}.side: unknown side`)
    if (x.inset !== undefined && !isFiniteNumber(x.inset)) issues.push(`${path}.inset: must be a finite number`)
    if (x.dy !== undefined && !isFiniteNumber(x.dy)) issues.push(`${path}.dy: must be a finite number`)
  } else {
    issues.push(`${path}.at: unknown move target kind ${JSON.stringify(x.at)}`)
  }
}

/** Best-effort static duration for a step, in ms, or null if it can't be computed without a runtime cursor. */
function stepDurationMs(x: Record<string, unknown>): number | null {
  switch (x.do) {
    case 'pose': return isFiniteNumber(x.ms) ? x.ms : 0
    case 'move': return isFiniteNumber(x.ms) ? x.ms : null // `speed`-based moves depend on runtime distance
    case 'say': return isFiniteNumber(x.holdMs) ? x.holdMs : 0
    case 'wait': return isFiniteNumber(x.ms) ? x.ms : 0
    case 'sfx': case 'fx': case 'cam': case 'camClear': return 0
    default: return null
  }
}

function checkStep(x: unknown, path: string, issues: Issues): void {
  if (!isPlainObject(x)) { issues.push(`${path}: step must be an object`); return }
  if (!oneOf(x.do, STEP_KINDS)) { issues.push(`${path}.do: unknown step kind ${JSON.stringify(x.do)}`); return }
  switch (x.do) {
    case 'pose':
      if (!oneOf(x.pose, POSES)) issues.push(`${path}.pose: unknown pose ${JSON.stringify(x.pose)}`)
      if (x.face !== undefined && x.face !== 1 && x.face !== -1 && x.face !== 'dir' && x.face !== '-dir') issues.push(`${path}.face: invalid`)
      if (x.ms !== undefined && (!isFiniteNumber(x.ms) || x.ms < 0)) issues.push(`${path}.ms: must be a non-negative finite number`)
      break
    case 'move':
      checkMoveTarget(x.to, `${path}.to`, issues)
      if (x.ms !== undefined && (!isFiniteNumber(x.ms) || x.ms < 0)) issues.push(`${path}.ms: must be a non-negative finite number`)
      if (x.speed !== undefined && (!isFiniteNumber(x.speed) || x.speed <= 0)) issues.push(`${path}.speed: must be a positive finite number`)
      if (x.ease !== undefined && !oneOf(x.ease, EASE_NAMES)) issues.push(`${path}.ease: unknown ease ${JSON.stringify(x.ease)}`)
      if (x.easeY !== undefined && !oneOf(x.easeY, EASE_NAMES)) issues.push(`${path}.easeY: unknown ease ${JSON.stringify(x.easeY)}`)
      if (x.pose !== undefined && !oneOf(x.pose, POSES)) issues.push(`${path}.pose: unknown pose ${JSON.stringify(x.pose)}`)
      if (x.arc !== undefined && !oneOf(x.arc, ['hop', 'vault'])) issues.push(`${path}.arc: must be 'hop' or 'vault'`)
      if (x.sfx !== undefined && !oneOf(x.sfx, SFX_KINDS)) issues.push(`${path}.sfx: unknown sfx kind ${JSON.stringify(x.sfx)}`)
      break
    case 'say':
      if (typeof x.text !== 'string') issues.push(`${path}.text: required string`)
      if (x.holdMs !== undefined && (!isFiniteNumber(x.holdMs) || x.holdMs < 0)) issues.push(`${path}.holdMs: must be a non-negative finite number`)
      break
    case 'sfx':
      if (!oneOf(x.kind, SFX_KINDS)) issues.push(`${path}.kind: unknown sfx kind ${JSON.stringify(x.kind)}`)
      break
    case 'wait':
      if (!isFiniteNumber(x.ms) || x.ms < 0) issues.push(`${path}.ms: required non-negative finite number`)
      break
    case 'fx':
      if (!oneOf(x.kind, FX_KINDS)) issues.push(`${path}.kind: unknown fx kind ${JSON.stringify(x.kind)}`)
      if (x.dir !== undefined && x.dir !== 1 && x.dir !== -1) issues.push(`${path}.dir: must be 1 or -1`)
      break
    case 'cam':
      if (x.on !== 'dash' && x.on !== 'target' && x.on !== 'midpoint') {
        if (!isPlainObject(x.on) || !isFiniteNumber(x.on.cx) || !isFiniteNumber(x.on.cy)) issues.push(`${path}.on: must be 'dash'|'target'|'midpoint'|{cx,cy}`)
      }
      if (x.mult !== undefined && !isFiniteNumber(x.mult)) issues.push(`${path}.mult: must be a finite number`)
      if (x.fast !== undefined && typeof x.fast !== 'boolean') issues.push(`${path}.fast: must be a boolean`)
      break
    case 'camClear':
      break
  }
}

function checkActionWhen(x: unknown, path: string, issues: Issues): void {
  if (x === undefined) return
  if (!isPlainObject(x)) { issues.push(`${path}: when must be an object`); return }
  for (const k of ['minDist', 'maxDist', 'minHoriz', 'minVert'] as const) {
    if (x[k] !== undefined && !isFiniteNumber(x[k])) issues.push(`${path}.${k}: must be a finite number`)
  }
  if (x.vert !== undefined && !oneOf(x.vert, ['up', 'down'])) issues.push(`${path}.vert: must be 'up' or 'down'`)
  if (x.fromPanel !== undefined && (!Array.isArray(x.fromPanel) || !x.fromPanel.every((p) => Number.isInteger(p)))) {
    issues.push(`${path}.fromPanel: must be an array of integers`)
  }
}

function checkAction(x: unknown, name: string, issues: Issues): void {
  const path = `actions[${JSON.stringify(name)}]`
  if (!isPlainObject(x)) { issues.push(`${path}: action must be an object`); return }
  checkActionWhen(x.when, `${path}.when`, issues)
  if (!Array.isArray(x.steps)) {
    issues.push(`${path}.steps: required array`)
    return
  }
  if (x.steps.length > MAX_STEPS) issues.push(`${path}.steps: ${x.steps.length} steps exceeds the cap of ${MAX_STEPS}`)
  let staticTotal = 0
  let allStatic = true
  x.steps.forEach((s, i) => {
    checkStep(s, `${path}.steps[${i}]`, issues)
    if (isPlainObject(s)) {
      const d = stepDurationMs(s)
      if (d === null) allStatic = false
      else staticTotal += d
    }
  })
  if (allStatic && staticTotal > MAX_ACTION_MS) {
    issues.push(`${path}: statically-computed total duration ${staticTotal}ms exceeds the cap of ${MAX_ACTION_MS}ms`)
  }
}

// ── entry points ────────────────────────────────────────────────────────────

/** Validate ONE action doc in isolation (the friend-submission trick uses the
 *  same step grammar and caps as the owner's Dojo actions). */
export function tryValidateAction(x: unknown, name = 'trick'): { ok: true } | { ok: false; errors: string[] } {
  const issues: Issues = []
  checkAction(x, name, issues)
  return issues.length > 0 ? { ok: false, errors: issues } : { ok: true }
}

export function tryValidateDoc(x: unknown): { ok: true; doc: NotebookDoc } | { ok: false; errors: string[] } {
  const issues: Issues = []
  if (!isPlainObject(x)) return { ok: false, errors: ['doc: must be an object'] }
  if (x.version !== 1) issues.push(`version: must be 1, got ${JSON.stringify(x.version)}`)

  const actionsRaw = x.actions
  let actionNames: Set<string> | null = null
  if (actionsRaw !== undefined) {
    if (!isPlainObject(actionsRaw)) {
      issues.push('actions: must be an object keyed by action name')
    } else {
      actionNames = new Set(Object.keys(actionsRaw))
      for (const [name, action] of Object.entries(actionsRaw)) checkAction(action, name, issues)
    }
  }

  checkCover(x.cover, 'cover', issues)

  if (!Array.isArray(x.pages) || x.pages.length < 1 || x.pages.length > MAX_PAGES) {
    issues.push(`pages: required array of 1-${MAX_PAGES} pages, got ${Array.isArray(x.pages) ? x.pages.length : typeof x.pages}`)
  } else {
    x.pages.forEach((pg, i) => checkPage(pg, `pages[${i}]`, issues, actionNames))
  }

  checkTravelConfig(x.travel, 'travel', issues, actionNames)

  if (issues.length > 0) return { ok: false, errors: issues }
  return { ok: true, doc: x as unknown as NotebookDoc }
}

export function validateDoc(x: unknown): NotebookDoc {
  const result = tryValidateDoc(x)
  if (!result.ok) throw new Error(`Invalid NotebookDoc:\n- ${result.errors.join('\n- ')}`)
  return result.doc
}

// Re-exported so callers of validate.ts don't need a separate import for these types.
export type { NotebookDoc, CoverDoc, PageDoc, PanelDoc, ArrivalDoc, BoxDoc, ActionDoc, ActionWhen, Step, MoveTarget, TravelConfig }
