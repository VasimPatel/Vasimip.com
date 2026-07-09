// ─────────────────────────────────────────────────────────────────────────────
// Custom-action COMPILER (pure). Walks an authored `ActionDoc` with a simulated
// cursor and pre-computes an absolute-time cue list — exactly the way the
// built-in choreographies in Notebook.tsx compute their whole timeline upfront
// (the `vaultTo` `runD`/`t0` idiom, `+40` slack, the universal `pose:'land'` →
// `+540ms` → `panelPose()`+`busy:false` tail).
//
// This file MUST NOT drift from the conventions in Notebook.tsx:
//   • anchor / dash position live in `dx`/`dy` space = `{ax-52, ay-113}`
//   • horizontal edge landings are `sideX - 52`; DASH_HALF_W=52, DASH_H=113
//   • `dtrans` is a hand-built transition string 'left Xs EASE, top Ys EASEY, opacity .25s'
//   • fx pulses reuse the built-in timings (shake 16/400, jitPage 16/560,
//     pageShove 1000, smoke +52/+60 for 700, crack +58 for 1650)
//   • camo focus is a {cx,cy,mult,fast} box; the +52/+62 dash-focus offset
// The EXECUTOR (Notebook.tsx, a later step) applies each `CuePatch` via setState
// and runs `panelPose()`+`busy:false` on the `finish` cue. This module stays
// pure and side-effect free (NO Math.random — deterministic).
// ─────────────────────────────────────────────────────────────────────────────
import type { Pose } from '../types'
import type { PanelGeom } from '../types'
import type { SfxKind } from '../audio'
import {
  type ActionDoc, type MoveTarget, type EaseName, type TravelConfig,
  POSES, SFX_KINDS, EASE_NAMES, FX_KINDS,
} from './docTypes'

// The coordinate constants the whole notebook agrees on (see Notebook.anch()).
export const DASH_HALF_W = 52
export const DASH_H = 113

// Compiler caps (mirrors the plan / validator).
const MAX_STEPS = 32
const MAX_TOTAL_MS = 8000
// World box the simulated cursor must stay inside (dx/dy space).
const WORLD_X: [number, number] = [-500, 1500]
const WORLD_Y: [number, number] = [-500, 1200]
// Default horizontal speed when a `move` gives neither `ms` nor `speed` (px/s;
// close to the built-ins' /270 run pacing).
const DEFAULT_SPEED = 270
// Panel-edge inset (ropeTo uses 8, vaultTo 6 — the plan picks 8).
const DEFAULT_INSET = 8

/** Context the executor supplies: current cursor, from/to geometry, the
 *  destination anchor (already in {ax-52, ay-113} space), and travel direction. */
export interface ActionCtx {
  from: { x: number; y: number }
  fromPanel: PanelGeom
  toPanel: PanelGeom
  anchor: { x: number; y: number }
  dir: 1 | -1
}

/** A narrow state patch a cue may apply. Deliberately NOT `State` from
 *  Notebook.tsx — the executor spreads this into setState in a later step. */
export type CuePatch = {
  pose?: Pose
  dx?: number
  dy?: number
  dtrans?: string
  face?: 1 | -1
  hopping?: boolean
  hopDur?: number
  vaulting?: boolean
  camo?: { cx: number; cy: number; mult: number; fast: boolean } | null
  react?: string | null
  smokeOn?: boolean
  smokeX?: number
  smokeY?: number
  crackOn?: boolean
  crackX?: number
  crackY?: number
  shakeOn?: boolean
  pageJit?: boolean
  pageShove?: number
}

export type Cue =
  | { patch: CuePatch }
  | { sfx: SfxKind }
  | { finish: true }

export type CompileResult =
  | { total: number; cues: Array<{ t: number; cue: Cue }> }
  | { error: string }

// ── ease presets = the beziers already living in Notebook.tsx ─────────────────
const EASE_CSS: Record<EaseName, string> = {
  linear: 'linear',
  launch: 'cubic-bezier(.5,.05,.45,1)',
  hopfall: 'cubic-bezier(.45,.05,.4,1)',
  glide: 'cubic-bezier(.3,.1,.6,1)',
  snap: 'cubic-bezier(.55,.05,.6,1)',
}

function inWorld(x: number, y: number): boolean {
  return (
    Number.isFinite(x) && Number.isFinite(y) &&
    x >= WORLD_X[0] && x <= WORLD_X[1] &&
    y >= WORLD_Y[0] && y <= WORLD_Y[1]
  )
}

/** Resolve a MoveTarget → absolute {x,y} in dx/dy space, mirroring the built-in
 *  edge math (`sideX - 52`, near/far against `dir`, top/bottom → `panel.y ± … - 113`). */
function resolveTarget(to: MoveTarget, cur: { x: number; y: number }, ctx: ActionCtx): { x: number; y: number } {
  if (to.at === 'anchor') {
    return { x: ctx.anchor.x + (to.dx ?? 0), y: ctx.anchor.y + (to.dy ?? 0) }
  }
  if (to.at === 'offset') {
    return { x: cur.x + to.dx, y: cur.y + to.dy }
  }
  // panelEdge
  const p = to.panel === 'from' ? ctx.fromPanel : ctx.toPanel
  const inset = to.inset ?? DEFAULT_INSET
  const dy = to.dy ?? 0
  const left = p.x + inset
  const right = p.x + p.w - inset
  switch (to.side) {
    // near = edge Dash approaches from; far = opposite (resolved against dir).
    case 'near': return { x: (ctx.dir === 1 ? left : right) - DASH_HALF_W, y: cur.y + dy }
    case 'far': return { x: (ctx.dir === 1 ? right : left) - DASH_HALF_W, y: cur.y + dy }
    case 'left': return { x: left - DASH_HALF_W, y: cur.y + dy }
    case 'right': return { x: right - DASH_HALF_W, y: cur.y + dy }
    // vertical targets keep the cursor's x, land on the panel's top/bottom edge.
    case 'top': return { x: cur.x, y: p.y - DASH_H + dy }
    case 'bottom': return { x: cur.x, y: p.y + p.h - DASH_H + dy }
  }
}

export function compileAction(def: ActionDoc, ctx: ActionCtx): CompileResult {
  if (def.steps.length > MAX_STEPS) return { error: 'too many steps (>' + MAX_STEPS + ')' }
  if (!inWorld(ctx.from.x, ctx.from.y)) return { error: 'start position out of world' }
  if (!inWorld(ctx.anchor.x, ctx.anchor.y)) return { error: 'anchor out of world' }

  const cues: Array<{ t: number; cue: Cue }> = []
  const emit = (t: number, cue: Cue) => cues.push({ t, cue })
  const patch = (t: number, p: CuePatch) => emit(t, { patch: p })

  const cur = { x: ctx.from.x, y: ctx.from.y }
  let t = 0

  const resFace = (f: 1 | -1 | 'dir' | '-dir' | undefined): 1 | -1 | undefined =>
    f === undefined ? undefined : f === 'dir' ? ctx.dir : f === '-dir' ? (-ctx.dir as 1 | -1) : f

  // Shared move emitter (used by author `move` steps and the epilogue corrective
  // move). Advances `t` by dur + 40 slack, moves the cursor, and clears the
  // one-shot arc flag at landing — exactly like hopTo/vaultTo clear at land.
  const emitMove = (
    target: { x: number; y: number }, durMs: number,
    easeName: EaseName, easeYName: EaseName,
    pose: Pose | undefined, arc: 'hop' | 'vault' | undefined, sfx: SfxKind | undefined,
  ) => {
    const durS = durMs / 1000
    const dtrans = 'left ' + durS + 's ' + EASE_CSS[easeName] + ', top ' + durS + 's ' + EASE_CSS[easeYName] + ', opacity .25s'
    const p: CuePatch = { dx: target.x, dy: target.y, dtrans }
    if (pose) p.pose = pose
    if (arc === 'hop') { p.hopping = true; p.hopDur = durS }
    else if (arc === 'vault') p.vaulting = true
    if (sfx) emit(t, { sfx })
    patch(t, p)
    if (arc === 'hop') patch(t + durMs, { hopping: false })
    else if (arc === 'vault') patch(t + durMs, { vaulting: false })
    cur.x = target.x
    cur.y = target.y
    t += durMs + 40
  }

  for (const step of def.steps) {
    switch (step.do) {
      case 'move': {
        const target = resolveTarget(step.to, cur, ctx)
        if (!inWorld(target.x, target.y)) return { error: 'move target out of world' }
        const dist = Math.hypot(target.x - cur.x, target.y - cur.y)
        let durMs: number
        if (step.ms != null) durMs = step.ms
        else durMs = Math.max(250, (dist / (step.speed ?? DEFAULT_SPEED)) * 1000)
        if (!Number.isFinite(durMs) || durMs < 0) return { error: 'bad move duration' }
        const easeName = step.ease ?? 'glide'
        const easeYName = step.easeY ?? easeName
        if (!EASE_NAMES.includes(easeName)) return { error: 'unknown ease: ' + easeName }
        if (!EASE_NAMES.includes(easeYName)) return { error: 'unknown easeY: ' + easeYName }
        if (step.pose && !POSES.includes(step.pose)) return { error: 'unknown pose: ' + step.pose }
        if (step.sfx && !SFX_KINDS.includes(step.sfx)) return { error: 'unknown sfx: ' + step.sfx }
        emitMove(target, durMs, easeName, easeYName, step.pose, step.arc, step.sfx)
        break
      }
      case 'pose': {
        if (!POSES.includes(step.pose)) return { error: 'unknown pose: ' + step.pose }
        const p: CuePatch = { pose: step.pose }
        const face = resFace(step.face)
        if (face !== undefined) p.face = face
        patch(t, p)
        t += step.ms ?? 0
        break
      }
      case 'say': {
        // Non-blocking (like the built-ins' react lines): show now, auto-clear
        // later, but do NOT advance the cursor.
        patch(t, { react: step.text })
        patch(t + (step.holdMs ?? 1600), { react: null })
        break
      }
      case 'sfx': {
        if (!SFX_KINDS.includes(step.kind)) return { error: 'unknown sfx: ' + step.kind }
        emit(t, { sfx: step.kind })
        break
      }
      case 'wait': {
        t += step.ms
        break
      }
      case 'fx': {
        if (!FX_KINDS.includes(step.kind)) return { error: 'unknown fx: ' + step.kind }
        // Fx fire in parallel with the surrounding steps — no time advance.
        if (step.kind === 'shake') {
          patch(t, { shakeOn: false })
          patch(t + 16, { shakeOn: true })
          patch(t + 400, { shakeOn: false })
        } else if (step.kind === 'jitPage') {
          patch(t, { pageJit: false })
          patch(t + 16, { pageJit: true })
          patch(t + 560, { pageJit: false })
        } else if (step.kind === 'pageShove') {
          patch(t, { pageShove: (step.dir ?? ctx.dir) * 34 })
          patch(t + 1000, { pageShove: 0 })
        } else if (step.kind === 'smoke') {
          patch(t, { smokeOn: true, smokeX: cur.x + 52, smokeY: cur.y + 60 })
          patch(t + 700, { smokeOn: false })
        } else if (step.kind === 'crack') {
          const fx = cur.x + 52
          const edge = fx < ctx.toPanel.x + ctx.toPanel.w / 2 ? ctx.toPanel.x : ctx.toPanel.x + ctx.toPanel.w
          patch(t, { crackOn: true, crackX: edge, crackY: cur.y + 58 })
          patch(t + 1650, { crackOn: false })
        }
        break
      }
      case 'cam': {
        let cx: number, cy: number
        if (step.on === 'dash') { cx = cur.x + 52; cy = cur.y + 62 }
        else if (step.on === 'target') { cx = ctx.toPanel.x + ctx.toPanel.w / 2; cy = ctx.toPanel.y + ctx.toPanel.h / 2 }
        else if (step.on === 'midpoint') { cx = ((cur.x + 52) + (ctx.anchor.x + 52)) / 2; cy = ((cur.y + 62) + (ctx.anchor.y + 62)) / 2 }
        else { cx = step.on.cx; cy = step.on.cy }
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return { error: 'bad cam focus' }
        patch(t, { camo: { cx, cy, mult: step.mult ?? 1.15, fast: step.fast ?? true } })
        break
      }
      case 'camClear': {
        patch(t, { camo: null })
        break
      }
    }
  }

  if (t > MAX_TOTAL_MS) return { error: 'action too long (' + Math.round(t) + 'ms > ' + MAX_TOTAL_MS + ')' }

  // ── Compiler-appended epilogue (never author-authored) ─────────────────────
  // Corrective hop back to the anchor if the cursor drifted, then the universal
  // land → +540ms → finish tail every built-in shares.
  if (Math.hypot(cur.x - ctx.anchor.x, cur.y - ctx.anchor.y) > 1) {
    emitMove({ x: ctx.anchor.x, y: ctx.anchor.y }, 500, 'launch', 'launch', 'tuck', 'hop', 'hop')
  }
  const landT = t
  patch(landT, { pose: 'land', camo: null, hopping: false, vaulting: false, dtrans: 'opacity .25s' })
  const finishT = landT + 540
  emit(finishT, { finish: true })

  return { total: finishT, cues }
}

/** Field-wise travel merge (plan Part 3): later wins wholesale per present field
 *  (`{...doc, ...page, ...panel}`). Deliberately dumb — an absent key never
 *  overrides an earlier value. */
export function resolveTravelConfig(
  doc: { travel?: TravelConfig },
  page: { travel?: TravelConfig },
  panel: { travel?: TravelConfig },
): TravelConfig {
  return { ...doc.travel, ...page.travel, ...panel.travel }
}
