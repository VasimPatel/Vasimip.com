// ─────────────────────────────────────────────────────────────────────────────
// Hand-rolled validator for NotebookDoc (no zod / new deps). Collects EVERY
// problem it finds (rather than bailing on the first) so authoring mistakes
// surface all at once — important once the admin portal (Part 5) starts
// POSTing hand-edited docs.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ARRIVAL_POSES, BOX_KINDS, FAM_VALUES, BUILTIN_MODES, STEP_KINDS, FX_KINDS, EASE_NAMES, SFX_KINDS, POSES, SKETCH_RADII,
} from './docTypes'
import type {
  NotebookDoc, CoverDoc, PageDoc, PanelDoc, ArrivalDoc, BoxDoc, ActionDoc, ActionWhen, Step, MoveTarget, TravelConfig,
} from './docTypes'

const MAX_PAGES = 12
const MAX_STEPS = 32
const MAX_ACTION_MS = 8000
const MAX_TEXT_CHARS = 2000
const MAX_STROKES = 64
const MAX_PATH_CHARS = 6000
const MAX_PID_CHARS = 24
/** How far (px) a box may stray beyond its panel's rect before it's flagged. */
const BOX_BAND = 400
const PATH_D_RE = /^[MLQCZmlqcz0-9 ,.\-]+$/

type Issues = string[]

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function oneOf<T extends string>(x: unknown, allowed: readonly T[]): x is T {
  return typeof x === 'string' && (allowed as readonly string[]).includes(x)
}

// ── field checkers (push problems onto `issues`, prefixed with `path`) ─────

function checkBox(x: unknown, path: string, issues: Issues, panelW: unknown, panelH: unknown): void {
  if (!isPlainObject(x)) { issues.push(`${path}: box must be an object`); return }
  if (!oneOf(x.kind, BOX_KINDS)) { issues.push(`${path}.kind: unknown box kind ${JSON.stringify(x.kind)}`); return }

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
  if (x.showIfFlag !== undefined && typeof x.showIfFlag !== 'string') issues.push(`${path}.showIfFlag: must be a string`)

  switch (x.kind) {
    case 'text': {
      if (typeof x.text !== 'string') { issues.push(`${path}.text: required string`); break }
      if (x.text.length > MAX_TEXT_CHARS) issues.push(`${path}.text: ${x.text.length} chars exceeds the cap of ${MAX_TEXT_CHARS}`)
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
  if (!Array.isArray(x.panels) || x.panels.length === 0) {
    issues.push(`${path}.panels: required non-empty array (>=1 panel)`)
  } else {
    x.panels.forEach((pnl, i) => checkPanel(pnl, `${path}.panels[${i}]`, issues, actionNames))
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
