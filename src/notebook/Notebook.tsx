// ─────────────────────────────────────────────────────────────────────────────
// Notebook — the Dash comic controller. A near-1:1 port of `class Component
// extends DCLogic` from dc_script.js into a React 19 class component. Every
// timing value, random-mode pool and behaviour is preserved verbatim; only the
// DCLogic template plumbing (string {{ bindings }}) is re-expressed as JSX with
// React style OBJECTS (see `styleFromCss`). DO NOT "improve" the timings.
// ─────────────────────────────────────────────────────────────────────────────
import React, { type CSSProperties } from 'react'
import type { Pose, HudTab, PageGeom } from './types'
import { POKE, CHATTER, DROPS, POKEARC, FIDGETARC, type ArcKey } from './constants'
import { AudioEngine, type SfxKind } from './audio'
import { pick, chance, scalar, setReviewRoute, reviewHook, reviewLog } from './review'

import CoverRenderer from './CoverRenderer'
import PageRenderer from './PageRenderer'
import { EngineLayer } from './engine/EngineLayer'
import { buildEngineDoc } from './engine/engineDoc'
import { DEFAULT_DOC } from './doc/defaultDoc'
import type { NotebookDoc, TravelConfig } from './doc/docTypes'
import { BUILTIN_MODES, SFX_KINDS } from './doc/docTypes'
import { compileAction, resolveTravelConfig, whenPasses } from './doc/actions'
import type { Cue, ActionCtx } from './doc/actions'
import Dash from './Dash'
import Hud from './Hud'
import Smoke from './effects/Smoke'
import Bomb from './effects/Bomb'
import Boom from './effects/Boom'
import Crack from './effects/Crack'
import Hole from './effects/Hole'
import FocusRing from './effects/FocusRing'
import ReactBubble from './effects/ReactBubble'
import PipSnark from './effects/PipSnark'

// ── Camera override emitted by the travel choreography ───────────────────────
interface Camo { cx: number; cy: number; mult: number; fast: boolean }

export interface NotebookProps {
  autoplaySeconds?: number
  pipSnark?: boolean
  soundOn?: boolean
  doc?: NotebookDoc
}

export interface State {
  page: number
  panel: number
  pose: Pose
  dx: number
  dy: number
  dop: number
  dtrans: string
  face: number
  hopping: boolean
  diving: boolean
  popping: boolean
  windup: boolean
  dragging: boolean
  fidget: ArcKey | null
  pokeAnim: ArcKey
  hopDur: number
  smokeOn: boolean
  smokeX: number
  smokeY: number
  bombFlyOn: boolean
  bombX: number
  bombY: number
  boomOn: boolean
  holeOn: boolean
  holeX: number
  holeY: number
  busy: boolean
  busyFlip: boolean
  flipRange: [number, number] | null
  auto: boolean
  sound: boolean
  flags: Record<string, boolean>
  poking: boolean
  react: string | null
  mx: number
  my: number
  camo: Camo | null
  shakeOn: boolean
  crackOn: boolean
  crackX: number
  crackY: number
  pageShove: number
  pageJit: boolean
  vaulting: boolean
  squish: boolean
  vw: number
  vh: number
}

/** Turn a CSS declaration list ("left:12px; top:4px; …") into a React style
 *  object, preserving the exact values the source strings carried. */
export function styleFromCss(css: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const part of css.split(';')) {
    const seg = part.trim()
    if (!seg) continue
    const idx = seg.indexOf(':')
    if (idx < 0) continue
    const prop = seg.slice(0, idx).trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
    out[prop] = seg.slice(idx + 1).trim()
  }
  return out as CSSProperties
}

export default class Notebook extends React.Component<NotebookProps, State> {
  private audio = new AudioEngine()
  private _tt: ReturnType<typeof setTimeout>[] = []
  private _cam: { tx: number; ty: number; sc: number } | null = null
  private _ai: ReturnType<typeof setInterval> | null = null
  private _ft: ReturnType<typeof setTimeout> | undefined
  private _ro: ResizeObserver | null = null
  private _mraf: number | null = null
  private _mx = 0
  private _my = 0
  private _downX = 0
  private _downY = 0
  private _maybeDrag = false
  private _dragged = false
  private _runId = 0
  private _geomDoc: NotebookDoc | null = null
  private _geomCache: PageGeom[] = []
  private _lastMode: string | null = null
  private _lastFl: string | null = null
  private _onR!: () => void
  private _onK!: (e: KeyboardEvent) => void
  private _onM!: (e: MouseEvent) => void
  private _onU!: () => void

  state: State = {
    page: 0, panel: 0, pose: 'hidden',
    dx: -200, dy: 300, dop: 0, dtrans: 'opacity .25s', face: 1,
    hopping: false, diving: false, popping: false, windup: false,
    dragging: false, fidget: null, pokeAnim: 'hop', hopDur: .92,
    smokeOn: false, smokeX: 0, smokeY: 0, bombFlyOn: false, bombX: 0, bombY: 0,
    boomOn: false, holeOn: false, holeX: 0, holeY: 0,
    busy: false, busyFlip: false, flipRange: null,
    auto: false, sound: true, flags: {},
    poking: false, react: null, mx: 640, my: 400,
    camo: null, shakeOn: false, crackOn: false, crackX: 0, crackY: 0,
    pageShove: 0, pageJit: false, vaulting: false, squish: false,
    vw: 1280, vh: 800
  }

  private get doc(): NotebookDoc { return this.props.doc ?? DEFAULT_DOC }

  /** Geometry adapter: cover stub + per-page panel geometry, rebuilt only when
   *  the doc reference changes. Every locomotion routine reads `this.geom()`. */
  geom(): PageGeom[] {
    const doc = this.doc
    if (this._geomDoc !== doc) {
      this._geomDoc = doc
      this._geomCache = [
        { name: 'COVER', panels: [] },
        ...doc.pages.map(p => ({ name: p.name, panels: p.panels.map(({ x, y, w, h, anchor }) => ({ x, y, w, h, ax: x + anchor.dx, ay: y + anchor.dy })) })),
      ]
    }
    return this._geomCache
  }

  componentDidMount() {
    this._tt = []
    setReviewRoute(this.engineMode ? 'engine' : 'legacy')
    this._onR = () => {
      const vw = window.innerWidth || document.documentElement.clientWidth || 1280
      const vh = window.innerHeight || document.documentElement.clientHeight || 800
      if (vw > 50 && vh > 50 && (vw !== this.state.vw || vh !== this.state.vh)) this.setState({ vw, vh })
    }
    this._onR()
    requestAnimationFrame(this._onR)
    ;[120, 300, 800, 2000].forEach(ms => setTimeout(this._onR, ms))
    window.addEventListener('resize', this._onR)
    try {
      this._ro = new ResizeObserver(this._onR)
      this._ro.observe(document.documentElement)
    } catch (e) { /* no ResizeObserver */ }
    this._onK = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.ensureAC(); this.next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.ensureAC(); this.prev() }
      else if (e.key === 'a' || e.key === 'A') { this.toggleAuto() }
      else if (e.key === 's' || e.key === 'S') { this.toggleSound() }
    }
    window.addEventListener('keydown', this._onK)
    this._onM = (e) => {
      this._mx = e.clientX; this._my = e.clientY
      if (this._maybeDrag && !this.state.dragging &&
          Math.hypot(e.clientX - this._downX, e.clientY - this._downY) > 7) this.startDrag()
      if (this._mraf) return
      this._mraf = requestAnimationFrame(() => {
        this._mraf = null
        const st: Partial<State> = { mx: this._mx, my: this._my }
        if (this.state.dragging && this._cam) {
          st.dx = (this._mx - this._cam.tx) / this._cam.sc - 52
          st.dy = (this._my - this._cam.ty) / this._cam.sc - 25
        }
        this.setState(st as State)
      })
    }
    const legacyOnM = this._onM
    this._onM = (e: MouseEvent) => {
      legacyOnM(e)
      const cam = this._cam
      if (this.engineMode && cam && cam.sc) {
        this.engineRef?.setLook((e.clientX - cam.tx) / cam.sc, (e.clientY - cam.ty) / cam.sc)
        this.engineRef?.notePointer(e.clientX, e.clientY)
      }
    }
    window.addEventListener('mousemove', this._onM)
    this._onU = () => { if (this.state.dragging) this.drop(); this._maybeDrag = false }
    window.addEventListener('mouseup', this._onU)
    this.scheduleFidget()
    this.setState({ sound: this.props.soundOn ?? true })
    // dev hook for headless verification; clamp to a valid page so it can't crash
    ;(window as unknown as { __notebookGoTo?: (p: number) => void }).__notebookGoTo = (p: number) =>
      this.flipTo(Math.max(0, Math.min(this.geom().length - 1, Math.round(p))))
    // dev hooks for the admin ▶ Test + headless action checks. Both auto-target
    // the FARTHEST panel on the current page (max |ax − dashCenterX|) so a Test is
    // a real traversal, not an in-place degenerate.
    ;(window as unknown as { __notebookRunAction?: (name: string) => void }).__notebookRunAction = (name: string) => {
      if (this.state.page <= 0) return
      // Engine mode: the migrated behavior (`act:<name>`) runs in the engine —
      // legacy state is hidden, so testing against it would test nothing visible.
      if (this.engineMode) {
        if (!this.engineRef?.busy()) this.engineRef?.testBehavior(`act:${name}`)
        return
      }
      if (this.state.busy) return
      const t = this._testTarget()
      if (t) this.runCustomAction(name, t.j, t.dir)
    }
    ;(window as unknown as { __notebookRunBuiltin?: (mode: string) => void }).__notebookRunBuiltin = (mode: string) => {
      if (this.state.page <= 0) return
      if (!(BUILTIN_MODES as readonly string[]).includes(mode)) return
      if (this.engineMode) {
        if (!this.engineRef?.busy()) this.engineRef?.testBehavior(`builtin:${mode}`)
        return
      }
      if (this.state.busy) return
      const t = this._testTarget()
      if (!t) return
      const { j, a, dir, dist } = t
      const m = mode as (typeof BUILTIN_MODES)[number]
      if (m === 'hop') this.hopTo(j)
      else if (m === 'walk') this.walkTo(j, a, dir, dist)
      else if (m === 'roll') this.rollTo(j, a, dir, dist)
      else if (m === 'poof') this.poofTo(j, a, dir)
      else if (m === 'vault') this.vaultTo(j, a, dir)
      else if (m === 'rope') this.ropeTo(j, a, dir)
      else if (m === 'swing') this.swingTo(j, a, dir)
      else if (m === 'wallrun') this.wallrunTo(j, a, dir)
      else if (m === 'slide') this.slideTo(j, a, dir)
      else if (m === 'smash') this.smashTo(j, a, dir)
      else this.comboTo(j, a, dir)
    }
    ;(window as unknown as { __notebookBusy?: () => boolean }).__notebookBusy = () =>
      this.engineMode ? this.state.busy || (this.engineRef?.busy() ?? false) : this.state.busy
  }

  /** Pick the farthest panel from Dash on the current page and pre-compute the
   *  geometry the built-in / custom methods expect (mirrors travel()'s locals).
   *  Fallback: the current panel when the page has only one. Used by the dev
   *  __notebookRun* hooks so the admin ▶ Test fires a genuine traversal. */
  private _testTarget(): { j: number; a: { x: number; y: number }; dir: 1 | -1; dist: number } | null {
    const s = this.state
    const panels = this.geom()[s.page]?.panels
    if (!panels || panels.length === 0) return null
    const cx = s.dx + 52
    let j = s.panel
    let best = -1
    for (let i = 0; i < panels.length; i++) {
      const d = Math.abs(panels[i].ax - cx)
      if (d > best) { best = d; j = i }
    }
    const a = this.anch(s.page, j)
    const dxv = a.x - s.dx
    const dir: 1 | -1 = dxv >= 0 ? 1 : -1
    const dist = Math.hypot(dxv, a.y - s.dy)
    return { j, a: { x: a.x, y: a.y }, dir, dist }
  }

  componentWillUnmount() {
    (this._tt || []).forEach(clearTimeout)
    window.removeEventListener('resize', this._onR)
    window.removeEventListener('keydown', this._onK)
    window.removeEventListener('mousemove', this._onM)
    window.removeEventListener('mouseup', this._onU)
    if (this._ft) clearTimeout(this._ft)
    if (this._mraf) cancelAnimationFrame(this._mraf)
    if (this._ro) this._ro.disconnect()
    if (this._ai) clearInterval(this._ai)
    delete (window as unknown as { __notebookGoTo?: (p: number) => void }).__notebookGoTo
    delete (window as unknown as { __notebookRunAction?: (name: string) => void }).__notebookRunAction
    delete (window as unknown as { __notebookRunBuiltin?: (mode: string) => void }).__notebookRunBuiltin
    delete (window as unknown as { __notebookBusy?: () => boolean }).__notebookBusy
  }

  /** Live doc-swap (admin preview): kill any in-flight choreography, invalidate the
   *  geometry cache, clamp page/panel into the new doc's range, and settle Dash into a
   *  safe idle at the clamped anchor so no timer resolves against stale geometry. */
  componentDidUpdate(prevProps: NotebookProps, prevState: State) {
    // Review timeline (parity harness): log the legacy actor's state transitions —
    // pose / page / panel / camera-override / busy edges — so both routes produce
    // one normalized timeline. No-op without the hook (one property read).
    if (reviewHook()?.log && !this.engineMode) {
      const s = this.state
      if (s.pose !== prevState.pose) reviewLog('legacy', 'pose', { from: prevState.pose, to: s.pose, dx: Math.round(s.dx), dy: Math.round(s.dy) })
      if (s.page !== prevState.page) reviewLog('legacy', 'page', { from: prevState.page, to: s.page })
      if (s.panel !== prevState.panel) reviewLog('legacy', 'panel', { to: s.panel })
      if (s.busy !== prevState.busy) reviewLog('legacy', 'busy', { busy: s.busy })
      if (s.camo !== prevState.camo) reviewLog('legacy', 'camo', s.camo ? { cx: Math.round(s.camo.cx), cy: Math.round(s.camo.cy), mult: s.camo.mult, fast: s.camo.fast } : null)
      if (s.react !== prevState.react && s.react) reviewLog('legacy', 'say', { text: s.react })
    }
    if (prevProps.doc === this.props.doc) return
    this._runId++
    this._tt.forEach(clearTimeout)
    this._tt = []
    const g = this.geom() // rebuilt against the new doc reference
    const page = Math.max(0, Math.min(g.length - 1, this.state.page))
    const panel = page === 0 ? 0 : Math.max(0, Math.min(g[page].panels.length - 1, this.state.panel))
    // NOTE: `flags` is deliberately PRESERVED across doc swaps — in the admin live
    // preview the doc changes on every edit, and resetting one-shot/showIfFlag state
    // (skillsRevealed etc.) per keystroke would make gated art flicker and replay.
    const safe: Partial<State> = {
      page, panel,
      busy: false, busyFlip: false, dragging: false, poking: false, camo: null,
      smokeOn: false, bombFlyOn: false, boomOn: false, holeOn: false, crackOn: false,
      shakeOn: false, pageJit: false, pageShove: 0, dtrans: 'none', react: null,
      windup: false, hopping: false, diving: false, popping: false, vaulting: false,
      squish: false, fidget: null, hopDur: .92,
    }
    if (page === 0) {
      this.setState({ ...safe, pose: 'hidden', dop: 0 } as State)
    } else {
      const a = this.anch(page, panel)
      this.setState({ ...safe, pose: 'idle', dx: a.x, dy: a.y, dop: 1 } as State)
    }
  }

  to(ms: number, fn: () => void) { this._tt.push(setTimeout(fn, ms)) }

  ensureAC() { this.audio.ensureAC() }
  sfx(kind: SfxKind) { this.audio.sfx(kind, this.state.sound) }

  anch(p: number, j: number) { const pn = this.geom()[p].panels[j]; return { x: pn.ax - 52, y: pn.ay - 113, pn } }

  panelPose(skipF?: boolean) {
    const s = this.state
    const pn = this.geom()[s.page]?.panels[s.panel]
    if (!pn) return
    const arrival = s.page > 0 ? this.doc.pages[s.page - 1].panels[s.panel].arrival : undefined
    const face = arrival?.face
    const faceExtra: Partial<State> = face ? { face } : {}
    // No pose, or a one-shot arrival that already played → plain idle.
    if (!arrival || !arrival.pose || (arrival.once && arrival.setFlag && s.flags[arrival.setFlag])) {
      this.setState({ pose: 'idle', ...faceExtra } as State)
    } else {
      if (arrival.sfx) this.sfx(arrival.sfx)
      const strike: Partial<State> = { pose: arrival.pose, ...faceExtra }
      if (arrival.setFlag) strike.flags = { ...s.flags, [arrival.setFlag]: true }
      if (arrival.say) strike.react = arrival.say
      this.setState(strike as State)
      if (arrival.say) {
        const line = arrival.say
        this.to((arrival.revertMs ?? 0) + 200, () => this.setState(st => (st.react === line ? { react: null } : null)))
      }
      if (arrival.revertMs) {
        const pose = arrival.pose
        this.to(arrival.revertMs, () => { if (this.state.pose === pose) this.setState({ pose: 'idle' }) })
      }
    }
    const flourish = arrival?.flourish ?? s.page !== this.geom().length - 1
    if (!skipF && !(arrival?.pose) && flourish && chance('flourish.roll', .24)) {
      this.to(650, () => {
        const st = this.state
        if (st.pose === 'idle' && !st.busy && !st.dragging && !st.poking) this.flourish(pn)
      })
    }
  }

  flourish(pn: { h: number }) {
    const opts = ['knock', 'shove']
    if (pn.h < 190) opts.push('squish', 'squish')
    let f = pick('flourish.kind', opts)
    if (f === this._lastFl) f = opts[(opts.indexOf(f) + 1) % opts.length]
    this._lastFl = f
    if (f === 'squish') {
      this.sfx('hop')
      const line = 'snug fit.'
      this.setState({ busy: true, squish: true, react: line })
      this.to(980, () => this.setState({ squish: false, busy: false }))
      this.to(1700, () => this.setState(st => (st.react === line ? { react: null } : null)))
    } else if (f === 'knock') {
      this.setState({ busy: true, pose: 'knock' })
      this.to(240, () => { this.sfx('knock'); this.jitPage() })
      this.to(580, () => { this.sfx('knock'); this.jitPage(); this.shakeCam() })
      this.to(1150, () => { this.setState({ busy: false }); this.panelPose(true) })
    } else {
      const sdir = (this.state.dx + 52) > 460 ? -1 : 1
      this.sfx('scrape')
      this.setState({ busy: true, pose: 'shove', face: sdir, pageShove: sdir * 34 })
      this.to(250, () => this.shakeCam())
      this.to(1000, () => this.setState({ pageShove: 0 }))
      this.to(1700, () => { this.setState({ busy: false }); this.panelPose(true) })
    }
  }

  // ── ENGINE MODE (P9b) — ?engine=1 mounts the new engine's Dash; legacy is the
  // untouched default until the 9c cutover. All engine hooks are guarded here.
  // ENGINE IS THE DEFAULT (owner-directed 9c). The untouched legacy experience
  // lives at /legacy (or ?legacy=1) for side-by-side comparison until the owner
  // explicitly retires it.
  private engineMode =
    typeof location === 'undefined' ||
    (!/(^|\/)legacy\/?$/.test(location.pathname) && !new URLSearchParams(location.search).has('legacy'))
  private engineRef: EngineLayer | null = null
  private _backNavPending = false

  /** Engine sfx kinds → the AudioEngine vocabulary (fx:* approximated until 9c). */
  private engineSfx(kind: string) {
    // The migration expresses v1 fx steps as sfx intents — the sound maps here,
    // and the legacy PAGE VISUAL replays alongside it (review: engine mode played
    // a whoosh with no shove/jitter/shake).
    if (kind === 'fx:pageShove') {
      const dir = this.engineRef && this.state.dx > 460 ? -1 : 1
      this.setState({ pageShove: dir * 34 })
      this.to(1000, () => this.setState({ pageShove: 0 }))
    } else if (kind === 'fx:jitPage') this.jitPage()
    else if (kind === 'fx:shake') this.shakeCam()
    const map: Record<string, SfxKind> = { 'fx:smoke': 'whoosh', 'fx:crack': 'crack', 'fx:shake': 'boom', 'fx:jitPage': 'scrib', 'fx:pageShove': 'whoosh', poof: 'whoosh', thud: 'knock' }
    const k = (map[kind] ?? kind) as SfxKind
    if ((SFX_KINDS as readonly string[]).includes(k)) this.sfx(k)
  }

  travel(j: number) {
    const s = this.state
    const a = this.anch(s.page, j)
    if (this.engineMode) {
      // Camera focuses via state.panel exactly as legacy; the engine owns motion.
      this.setState({ panel: j, dx: a.x, dy: a.y })
      this.engineRef?.travelTo(j)
      return
    }
    const dxv = a.x - s.dx, dyv = a.y - s.dy
    const horiz = Math.abs(dxv), vert = Math.abs(dyv)
    const dist = Math.hypot(dxv, dyv)
    const dir: 1 | -1 = dxv >= 0 ? 1 : -1
    // Resolve the per-transition travel superset (destination panel wins wholesale).
    // travel() only ever runs on real pages, so page-1 is always a valid page index.
    const pageDoc = s.page > 0 ? this.doc.pages[s.page - 1] : undefined
    const cfg: TravelConfig = pageDoc
      ? resolveTravelConfig(this.doc, pageDoc, pageDoc.panels[j])
      : {}
    const comboExcluded = !!cfg.builtins && !cfg.builtins.includes('combo')
    if (dist > 380 && horiz > 240 && vert > 60 && chance('travel.combo', .18) && this._lastMode !== 'combo' && !comboExcluded) {
      this._lastMode = 'combo'
      this.comboTo(j, a, dir)
      return
    }
    let pool: string[]
    if (vert > 110) pool = dyv < 0 ? ['wallrun', 'wallrun', 'swing', 'hop', 'poof'] : ['slide', 'slide', 'swing', 'hop', 'roll']
    else if (horiz > 430) pool = ['swing', 'rope', 'rope', 'vault', 'poof']
    else if (horiz > 250) pool = ['vault', 'vault', 'rope', 'swing', 'walk', 'smash']
    else pool = ['walk', 'vault', 'hop', 'roll', 'smash', 'walk']
    // (a) Filter the built-in pool by the config allow-list, but never let an
    // author error empty the pool — restore the unfiltered pool if it does.
    if (cfg.builtins) {
      const allowed = cfg.builtins as string[]
      const filtered = pool.filter(m => allowed.includes(m))
      if (filtered.length > 0) pool = filtered
    }
    // (b) Splice in gated-in custom actions, weighted.
    if (cfg.actions) {
      const weight = Math.max(0, Math.floor(cfg.actionWeight ?? 1))
      for (const name of cfg.actions) {
        const def = this.doc.actions?.[name]
        if (!def || !whenPasses(def.when, { dist, horiz, vert, dyv, fromPanel: s.panel })) continue
        for (let k = 0; k < weight; k++) pool.push('act:' + name)
      }
    }
    let m = pick('travel.mode', pool)
    if (m === this._lastMode) m = pool[(pool.indexOf(m) + 1) % pool.length]
    this._lastMode = m
    // (c) Dispatch: custom actions go through the interpreter; built-ins unchanged.
    if (m.startsWith('act:')) this.runCustomAction(m.slice(4), j, dir)
    else if (m === 'hop') this.hopTo(j)
    else if (m === 'walk') this.walkTo(j, a, dir, dist)
    else if (m === 'roll') this.rollTo(j, a, dir, dist)
    else if (m === 'poof') this.poofTo(j, a, dir)
    else if (m === 'vault') this.vaultTo(j, a, dir)
    else if (m === 'rope') this.ropeTo(j, a, dir)
    else if (m === 'swing') this.swingTo(j, a, dir)
    else if (m === 'wallrun') this.wallrunTo(j, a, dir)
    else if (m === 'slide') this.slideTo(j, a, dir)
    else this.smashTo(j, a, dir)
  }

  /** Run an authored custom action toward panel `j`. Compile-or-fallback (never
   *  wedge): on any compile error / missing def it degrades to `hopTo(j)`. All cues
   *  are pre-scheduled (not chained) and guarded by a `_runId` token so a doc swap /
   *  interrupt invalidates them; a watchdog force-snaps Dash home if a run overruns. */
  runCustomAction(name: string, j: number, dir: 1 | -1) {
    const s = this.state
    const A = this.anch(s.page, j)
    const ctx: ActionCtx = {
      from: { x: s.dx, y: s.dy },
      fromPanel: this.geom()[s.page].panels[s.panel],
      toPanel: this.geom()[s.page].panels[j],
      anchor: { x: A.x, y: A.y },
      dir,
    }
    const def = this.doc.actions?.[name]
    const res = def ? compileAction(def, ctx) : { error: 'unknown action ' + name }
    if ('error' in res) {
      if (import.meta.env.DEV) console.warn('[notebook] action "' + name + '" fell back to hop:', res.error)
      this.hopTo(j)
      return
    }
    this.setState({ busy: true, panel: j, face: dir, fidget: null })
    const runId = ++this._runId
    let finished = false // set by the finish cue so the watchdog can't misfire on a LATER busy choreography
    for (const { t, cue } of res.cues) {
      this.to(t, () => {
        if (this._runId !== runId) return
        if ('finish' in cue) finished = true
        this.applyCue(cue, j)
      })
    }
    // Watchdog: if the run somehow never releases busy, snap Dash to the anchor.
    this.to(res.total + 1500, () => {
      if (finished || this._runId !== runId || !this.state.busy) return
      const a = this.anch(this.state.page, j)
      this.setState({ busy: false, camo: null, hopping: false, vaulting: false, dx: a.x, dy: a.y, dtrans: 'opacity .25s', pose: 'idle' })
      this.panelPose()
    })
  }

  /** Apply a single compiled cue to component state (the executor half of the
   *  pure compiler). `finish` runs the universal panelPose()+busy:false tail. */
  applyCue(cue: Cue, _j: number) {
    if ('sfx' in cue) this.sfx(cue.sfx)
    else if ('patch' in cue) this.setState(cue.patch as State)
    else if ('finish' in cue) { this.panelPose(); this.setState({ busy: false }) }
  }

  shakeCam() {
    this.setState({ shakeOn: false })
    this.to(16, () => this.setState({ shakeOn: true }))
    this.to(400, () => this.setState({ shakeOn: false }))
  }

  jitPage() {
    this.setState({ pageJit: false })
    this.to(16, () => this.setState({ pageJit: true }))
    this.to(560, () => this.setState({ pageJit: false }))
  }

  vaultTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    const A = this.geom()[s.page].panels[s.panel]
    const edgeDx = (dir === 1 ? A.x + A.w - 6 : A.x + 6) - 52
    const runD = Math.max(.28, Math.abs(edgeDx - s.dx) / 270)
    const tPk = chance('vault.peek', .3) ? 760 : 0
    const t0 = runD * 1000 + 40
    this.sfx('scrib')
    this.setState({ busy: true, panel: j, pose: 'walk', face: dir, fidget: null, dx: edgeDx, dtrans: 'left ' + runD + 's linear, opacity .25s' })
    if (tPk) this.to(t0, () => this.setState({ pose: 'peek' }))
    this.to(t0 + tPk, () => {
      this.sfx('whoosh')
      this.setState({
        pose: 'vault', vaulting: true,
        camo: { cx: (edgeDx + a.x) / 2 + 52, cy: a.y + 30, mult: 1.15, fast: true },
        dx: a.x, dy: a.y,
        dtrans: 'left .5s cubic-bezier(.45,.05,.4,1), top .5s cubic-bezier(.45,.05,.4,1), opacity .25s'
      })
    })
    this.to(t0 + tPk + 540, () => { this.sfx('hop'); this.shakeCam(); this.setState({ pose: 'land', vaulting: false, camo: null }) })
    this.to(t0 + tPk + 1080, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  ropeTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    const A = this.geom()[s.page].panels[s.panel]
    const edgeDx = (dir === 1 ? A.x + A.w - 8 : A.x + 8) - 52
    const runD = Math.max(.28, Math.abs(edgeDx - s.dx) / 270)
    const walkD = Math.max(.9, Math.abs(a.x - edgeDx) / 115)
    const t0 = runD * 1000 + 60
    this.sfx('scrib')
    this.setState({ busy: true, panel: j, pose: 'walk', face: dir, fidget: null, dx: edgeDx, dtrans: 'left ' + runD + 's linear, opacity .25s' })
    this.to(t0, () => this.setState({
      pose: 'rope',
      camo: { cx: (edgeDx + a.x) / 2 + 52, cy: a.y + 20, mult: 1.22, fast: false },
      dx: a.x, dy: a.y,
      dtrans: 'left ' + walkD + 's linear, top ' + walkD + 's linear, opacity .25s'
    }))
    this.to(t0 + walkD * 1000 + 60, () => { this.sfx('hop'); this.shakeCam(); this.setState({ pose: 'land', camo: null }) })
    this.to(t0 + walkD * 1000 + 600, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  swingTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    const B = this.geom()[s.page].panels[j]
    const barDx = (dir === 1 ? B.x + 34 : B.x + B.w - 34) - 52
    const barDy = B.y - 12
    this.setState({ busy: true, windup: true, panel: j, face: dir, fidget: null })
    this.to(180, () => {
      this.sfx('hop')
      this.setState({ windup: false, pose: 'tuck', hopping: true, hopDur: .6, dx: barDx, dy: barDy, dtrans: 'left .6s cubic-bezier(.5,.05,.45,1), top .6s cubic-bezier(.5,.05,.45,1), opacity .25s' })
    })
    this.to(800, () => {
      this.sfx('whoosh')
      this.setState({ hopping: false, hopDur: .92, pose: 'swing', camo: { cx: barDx + 52, cy: barDy + 70, mult: 1.2, fast: true } })
    })
    this.to(1440, () => {
      this.sfx('whoosh')
      this.setState({ pose: 'tuck', camo: null, dx: a.x, dy: a.y, dtrans: 'left .5s cubic-bezier(.3,.15,.5,1), top .5s cubic-bezier(.55,-.35,.6,1), opacity .25s' })
    })
    this.to(1980, () => { this.sfx('hop'); this.setState({ pose: 'land' }); this.shakeCam() })
    this.to(2520, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  wallrunTo(j: number, a: { x: number; y: number }, _dir: number) {
    const s = this.state
    const B = this.geom()[s.page].panels[j]
    const fx = s.dx + 52
    const sideX = fx < B.x + B.w / 2 ? B.x : B.x + B.w
    const wdir = fx <= sideX ? 1 : -1
    const wallDx = sideX - 52
    const runD = Math.max(.28, Math.abs(wallDx - s.dx) / 290)
    const midDy = B.y - 70
    const climbD = Math.max(.45, Math.abs(midDy - s.dy) / 330)
    const t0 = runD * 1000 + 40
    this.sfx('scrib')
    this.setState({ busy: true, panel: j, pose: 'walk', face: wdir, fidget: null, dx: wallDx, dtrans: 'left ' + runD + 's linear, opacity .25s' })
    this.to(t0, () => {
      this.sfx('whoosh')
      this.setState({ pose: 'wallrun', dy: midDy, dtrans: 'top ' + climbD + 's cubic-bezier(.42,.1,.5,1), opacity .25s', camo: { cx: sideX, cy: B.y + 40, mult: 1.1, fast: true } })
    })
    this.to(t0 + climbD * 1000 + 60, () => {
      this.sfx('hop')
      this.setState({ pose: 'tuck', hopping: true, hopDur: .45, dx: a.x, dy: a.y, dtrans: 'left .45s cubic-bezier(.5,.05,.45,1), top .45s cubic-bezier(.5,.05,.45,1), opacity .25s' })
    })
    this.to(t0 + climbD * 1000 + 540, () => { this.setState({ hopping: false, hopDur: .92, pose: 'land', camo: null }); this.shakeCam() })
    this.to(t0 + climbD * 1000 + 1080, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  slideTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    const A = this.geom()[s.page].panels[s.panel]
    const sideX = dir === 1 ? A.x + A.w : A.x
    const slDx = sideX - 52
    const runD = Math.max(.25, Math.abs(slDx - s.dx) / 290)
    const botDy = A.y + A.h - 105
    const slideD = Math.max(.4, Math.abs(botDy - s.dy) / 380)
    const t0 = runD * 1000 + 40
    this.sfx('scrib')
    this.setState({ busy: true, panel: j, pose: 'walk', face: dir, fidget: null, dx: slDx, dtrans: 'left ' + runD + 's linear, opacity .25s' })
    this.to(t0, () => {
      this.sfx('scrape')
      this.setState({ pose: 'slide', dy: botDy, dtrans: 'top ' + slideD + 's cubic-bezier(.5,.05,.55,1), opacity .25s', camo: { cx: sideX, cy: A.y + A.h - 40, mult: 1.12, fast: true } })
    })
    this.to(t0 + slideD * 1000 + 60, () => {
      this.sfx('hop')
      this.setState({ pose: 'tuck', hopping: true, hopDur: .5, dx: a.x, dy: a.y, dtrans: 'left .5s cubic-bezier(.5,.05,.45,1), top .5s cubic-bezier(.5,.05,.45,1), opacity .25s' })
    })
    this.to(t0 + slideD * 1000 + 590, () => { this.setState({ hopping: false, hopDur: .92, pose: 'land', camo: null }); this.shakeCam() })
    this.to(t0 + slideD * 1000 + 1130, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  smashTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    const A = this.geom()[s.page].panels[s.panel]
    const edgeFx = dir === 1 ? A.x + A.w : A.x
    const edgeDx = edgeFx - dir * 30 - 52
    const runD = Math.max(.25, Math.abs(edgeDx - s.dx) / 260)
    const wd = Math.max(.5, Math.abs(a.x - edgeDx) / 220)
    const t0 = runD * 1000 + 60
    this.sfx('scrib')
    this.setState({ busy: true, panel: j, pose: 'walk', face: dir, fidget: null, dx: edgeDx, dtrans: 'left ' + runD + 's linear, opacity .25s' })
    this.to(t0, () => this.setState({ pose: 'punch', camo: { cx: edgeFx, cy: this.state.dy + 62, mult: 1.28, fast: true } }))
    this.to(t0 + 300, () => { this.sfx('crack'); this.shakeCam(); this.setState({ crackOn: true, crackX: edgeFx, crackY: this.state.dy + 58 }) })
    this.to(t0 + 950, () => {
      this.sfx('scrib')
      this.setState({ pose: 'walk', camo: null, dx: a.x, dy: a.y, dtrans: 'left ' + wd + 's linear, top ' + wd + 's linear, opacity .25s' })
    })
    this.to(t0 + 950 + wd * 1000 + 40, () => this.setState({ pose: 'land' }))
    this.to(t0 + 950 + wd * 1000 + 560, () => { this.panelPose(); this.setState({ busy: false }) })
    this.to(t0 + 2600, () => this.setState({ crackOn: false }))
  }

  comboTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    const A = this.geom()[s.page].panels[s.panel]
    const farX = dir === 1 ? A.x : A.x + A.w
    const nearX = dir === 1 ? A.x + A.w : A.x
    const wallDx = farX - 52
    const runD = Math.max(.25, Math.abs(wallDx - s.dx) / 300)
    const topDy = A.y - 113
    const climbD = Math.max(.4, Math.abs(topDy - s.dy) / 300)
    const ropeDx = nearX - dir * 16 - 52
    const ropeD = Math.max(.8, Math.abs(ropeDx - wallDx) / 130)
    let t = runD * 1000 + 40
    this.sfx('scrib')
    this.setState({ busy: true, panel: j, pose: 'walk', face: dir === 1 ? -1 : 1, fidget: null, dx: wallDx, dtrans: 'left ' + runD + 's linear, opacity .25s' })
    this.to(t, () => {
      this.sfx('whoosh')
      this.setState({ pose: 'wallrun', face: dir, dy: topDy, dtrans: 'top ' + climbD + 's cubic-bezier(.4,.1,.5,1), opacity .25s', camo: { cx: farX, cy: A.y + 60, mult: 1.12, fast: true } })
    })
    t += climbD * 1000 + 60
    this.to(t, () => this.setState({ pose: 'rope', camo: { cx: A.x + A.w / 2, cy: A.y - 30, mult: 1.1, fast: false }, dx: ropeDx, dtrans: 'left ' + ropeD + 's linear, opacity .25s' }))
    t += ropeD * 1000 + 60
    this.to(t, () => {
      this.sfx('whoosh')
      this.setState({ pose: 'tuck', hopping: true, hopDur: .62, camo: null, dx: a.x, dy: a.y, dtrans: 'left .62s cubic-bezier(.5,.05,.45,1), top .62s cubic-bezier(.5,.05,.45,1), opacity .25s' })
    })
    t += 680
    this.to(t, () => { this.sfx('hop'); this.setState({ hopping: false, hopDur: .92, pose: 'land' }); this.shakeCam() })
    this.to(t + 540, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  walkTo(j: number, a: { x: number; y: number }, dir: number, dist: number) {
    const dur = Math.max(.7, Math.min(2.2, dist / 190))
    this.sfx('scrib')
    this.setState({
      busy: true, panel: j, pose: 'walk', face: dir, fidget: null,
      dx: a.x, dy: a.y,
      dtrans: 'left ' + dur + 's linear, top ' + dur + 's linear, opacity .25s'
    })
    this.to(dur * 1000 + 40, () => this.setState({ pose: 'land' }))
    this.to(dur * 1000 + 560, () => { this.panelPose(); this.setState({ busy: false }) })
    if (dur > 1.0 && chance('walk.trip', 0.28)) {
      const tAt = dur * 1000 * 0.42, line = 'whoa—'
      this.to(tAt, () => { if (this.state.pose === 'walk') { this.sfx('hop'); this.setState({ pose: 'trip', react: line }) } })
      this.to(tAt + 520, () => { if (this.state.pose === 'trip') this.setState({ pose: 'walk' }); this.setState(st => (st.react === line ? { react: null } : null)) })
    }
  }

  rollTo(j: number, a: { x: number; y: number }, dir: number, dist: number) {
    const dur = Math.max(.5, Math.min(1.4, dist / 300))
    this.sfx('hop')
    this.setState({
      busy: true, panel: j, pose: 'tuck', face: dir, fidget: null,
      dx: a.x, dy: a.y,
      dtrans: 'left ' + dur + 's cubic-bezier(.3,.1,.6,1), top ' + dur + 's cubic-bezier(.3,.1,.6,1), opacity .25s'
    })
    this.to(dur * 1000 + 30, () => this.setState({ pose: 'land' }))
    this.to(dur * 1000 + 560, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  poofTo(j: number, a: { x: number; y: number }, dir: number) {
    const s = this.state
    this.sfx('flip')
    this.setState({ busy: true, fidget: null, smokeOn: true, smokeX: s.dx + 52, smokeY: s.dy + 60 })
    this.to(150, () => this.setState({ pose: 'hidden', dop: 0 }))
    this.to(520, () => this.setState({ smokeOn: false, panel: j, dx: a.x, dy: a.y, dtrans: 'none' }))
    this.to(620, () => { this.setState({ smokeOn: true, smokeX: a.x + 52, smokeY: a.y + 60 }); this.sfx('flip') })
    this.to(760, () => this.setState({ dop: 1, pose: 'land', face: dir, dtrans: 'opacity .2s' }))
    this.to(1240, () => { this.panelPose(); this.setState({ busy: false }) })
    this.to(1350, () => this.setState({ smokeOn: false }))
  }

  hopTo(j: number) {
    const s = this.state
    const a = this.anch(s.page, j)
    const dir = a.x >= s.dx ? 1 : -1
    const hang = chance('hop.hang', .25) && a.pn.ay <= a.pn.y + 6
    this.setState({ busy: true, windup: true, face: dir, fidget: null })
    this.to(180, () => {
      this.sfx('hop')
      this.setState({
        windup: false, panel: j, pose: 'tuck', hopping: true, hopDur: .92,
        dx: a.x, dy: hang ? a.y + 102 : a.y,
        dtrans: 'left .92s cubic-bezier(.5,.05,.45,1), top .92s cubic-bezier(.5,.05,.45,1), opacity .25s'
      })
    })
    if (hang) {
      const line = 'hup—'
      this.to(1110, () => { this.sfx('hop'); this.shakeCam(); this.setState({ pose: 'hang', hopping: false, react: line }) })
      this.to(2080, () => {
        this.sfx('whoosh')
        this.setState({ pose: 'tuck', dy: a.y, dtrans: 'top .4s cubic-bezier(.4,-.35,.55,1), left .4s linear, opacity .25s' })
        this.setState(st => (st.react === line ? { react: null } : null))
      })
      this.to(2520, () => this.setState({ pose: 'land' }))
      this.to(3060, () => { this.panelPose(); this.setState({ busy: false }) })
    } else {
      this.to(1110, () => this.setState({ pose: 'land', hopping: false }))
      this.to(1600, () => { this.panelPose(); this.setState({ busy: false }) })
    }
  }

  enterPage() {
    if (this.engineMode) {
      // The EngineLayer performs the entrance (its page prop changed); legacy
      // page-entry STATE must still reset or nav wedges on busy (found live).
      this.setState({ panel: 0, busy: false, dop: 0 })
      return
    }
    const a = this.anch(this.state.page, 0)
    this.setState({ panel: 0, pose: 'walk', face: 1, dx: -150, dy: a.y, dop: 1, dtrans: 'opacity .25s' })
    this.sfx('scrib')
    this.to(60, () => this.setState({ dx: a.x, dtrans: 'left 1.25s linear, opacity .25s' }))
    this.to(1350, () => this.setState({ pose: 'land' }))
    this.to(1660, () => { this.panelPose(); this.setState({ busy: false }) })
  }

  flipTo(p: number, landPanel = 0) {
    const s = this.state
    if (s.busy || s.dragging || p === s.page) return
    this.sfx('flip')
    const lo = Math.min(s.page, p), hi = Math.max(s.page, p) - 1
    if (p === s.page + 1 && s.page > 0 && chance('flip.surf', .38)) {
      // ONE surf roll for both routes (review: the engine branch falling through
      // rolled a second legacy chance, inflating surf probability and running
      // hidden legacy choreography in admin previews).
      if (this.engineMode) {
        this.engineRef?.surfNext() // the layer stages the ride-in after the flip
      } else if (s.dop === 1) {
      const a = this.anch(p, 0)
      this.sfx('whoosh')
      this.setState({
        busy: true, busyFlip: true, flipRange: [lo, hi], page: p, panel: 0,
        pose: 'surf', face: 1, fidget: null,
        dx: a.x, dy: a.y - 96,
        dtrans: 'left .78s cubic-bezier(.5,.08,.28,1), top .78s cubic-bezier(.5,.08,.28,1), opacity .25s'
      })
      this.to(820, () => this.setState({ busyFlip: false }))
      this.to(880, () => { this.sfx('hop'); this.setState({ pose: 'tuck', dy: a.y, dtrans: 'top .34s cubic-bezier(.55,.05,.6,1), left .34s linear, opacity .25s' }) })
      this.to(1240, () => { this.setState({ pose: 'land' }); this.shakeCam() })
      this.to(1780, () => { this.panelPose(); this.setState({ busy: false }) })
      return
      }
    }
    this.setState({ busy: true, busyFlip: true, flipRange: [lo, hi], page: p, panel: landPanel, pose: 'hidden', dop: 0 })
    this.to(820, () => {
      this.setState({ busyFlip: false })
      if (p === 0) this.setState({ busy: false })
      else if (this.engineMode) {
        // The engine layer stages its own entrance/landing (and keeps its OWN
        // busy); legacy enterPage() would stomp `panel` back to 0 (review
        // BLOCKER: back-nav landings focus the LAST panel) and run the hidden
        // legacy walk-in against engine state.
        this.setState({ busy: false })
      } else this.enterPage()
    })
  }

  next() {
    const s = this.state
    if (s.busy || s.dragging) return
    // Engine travels/stagings don't set Notebook busy — gate on the engine's own
    // busy (review BLOCKER: repeated input / the autoplay interval could
    // interrupt long performances mid-staging).
    if (this.engineMode && this.engineRef?.busy()) return
    if (s.page === 0) { this.flipTo(1); return }
    const n = this.geom()[s.page].panels.length
    if (s.panel < n - 1) this.travel(s.panel + 1)
    else if (s.page < this.geom().length - 1) this.flipTo(s.page + 1)
    else if (s.auto) this.toggleAuto()
  }

  prev() {
    const s = this.state
    if (s.busy || s.dragging || s.page === 0) return
    if (this.engineMode && this.engineRef?.busy()) return
    if (s.panel > 0) this.travel(s.panel - 1)
    else if (s.page === 1) this.flipTo(0)
    else if (this.engineMode) {
      if (this._backNavPending) return
      const kind = chance('backnav.bomb', 0.55) ? 'bomb' : 'poof'
      const target = s.page - 1 // captured NOW (review: delayed done() re-read state)
      // Legacy lands at the LAST panel of the previous page (bomb pop-out /
      // poof reappear) — the engine stages the landing there via done().
      const landing = Math.max(0, (this.geom()[target]?.panels.length ?? 1) - 1)
      this.ensureAC()
      if (this.engineRef) {
        this._backNavPending = true
        this.engineRef.backNav(kind, landing, () => {
          this._backNavPending = false
          if (this.state.page === s.page) this.flipTo(target, landing) // superseded nav wins
        })
      } else this.flipTo(target)
    }
    else if (chance('backnav.bomb', .55)) this.bombBack()
    else this.poofBack()
  }

  bombBack() {
    const s = this.state
    const fromPage = s.page
    const gx = s.dx + 52, gy = s.dy + 113
    const dirT = gx > 460 ? -1 : 1
    const txp = Math.max(90, Math.min(830, gx + dirT * 175))
    this.setState({ busy: true, pose: 'throw', face: dirT, fidget: null, holeX: txp, holeY: gy })
    this.sfx('scrib')
    this.to(300, () => this.setState({ pose: 'idle', bombFlyOn: true, bombX: gx + dirT * 14, bombY: s.dy + 38 }))
    this.to(360, () => this.setState({ bombX: txp, bombY: gy - 12 }))
    this.to(950, () => { this.setState({ bombFlyOn: false, boomOn: true, holeOn: true }); this.sfx('boom') })
    this.to(1300, () => {
      this.sfx('hop')
      this.setState({
        pose: 'tuck', hopping: true, hopDur: .5, dx: txp - 52, dy: gy - 113,
        dtrans: 'left .5s cubic-bezier(.5,.05,.45,1), top .5s cubic-bezier(.5,.05,.45,1), opacity .25s'
      })
    })
    this.to(1850, () => this.setState({ hopping: false, hopDur: .92, pose: 'dive', diving: true }))
    this.to(2430, () => {
      const p = fromPage - 1
      const j = this.geom()[p].panels.length - 1
      const a = this.anch(p, j)
      this.sfx('flip')
      this.setState({
        pose: 'hidden', dop: 0, diving: false, boomOn: false, holeOn: false,
        busyFlip: true, flipRange: [p, p], page: p, panel: j,
        holeX: a.x + 52, holeY: a.y + 113
      })
    })
    this.to(3300, () => {
      const a = this.anch(this.state.page, this.state.panel)
      this.setState({
        busyFlip: false, holeOn: true, dx: a.x, dy: a.y, dop: 1,
        dtrans: 'opacity .25s', pose: 'tuck', popping: true, face: 1
      })
      this.sfx('hop')
    })
    this.to(3900, () => this.setState({ pose: 'land', popping: false }))
    this.to(4230, () => { this.setState({ holeOn: false, busy: false }); this.panelPose() })
  }

  poofBack() {
    const s = this.state
    const fromPage = s.page
    this.sfx('flip')
    this.setState({ busy: true, fidget: null, smokeOn: true, smokeX: s.dx + 52, smokeY: s.dy + 60 })
    this.to(140, () => this.setState({ pose: 'hidden', dop: 0 }))
    this.to(650, () => {
      const p = fromPage - 1
      const j = this.geom()[p].panels.length - 1
      this.sfx('flip')
      this.setState({ smokeOn: false, busyFlip: true, flipRange: [p, p], page: p, panel: j })
    })
    this.to(1520, () => {
      const a = this.anch(this.state.page, this.state.panel)
      this.setState({ busyFlip: false, smokeOn: true, smokeX: a.x + 52, smokeY: a.y + 60, dx: a.x, dy: a.y, dtrans: 'none' })
    })
    this.to(1660, () => this.setState({ dop: 1, pose: 'land', face: 1, dtrans: 'opacity .2s' }))
    this.to(2000, () => { this.setState({ busy: false }); this.panelPose() })
    this.to(2150, () => this.setState({ smokeOn: false }))
  }

  toggleAuto() {
    if (this._ai) {
      clearInterval(this._ai); this._ai = null
      this.setState({ auto: false })
    } else {
      this.ensureAC()
      this._ai = setInterval(() => { if (!this.state.busy) this.next() }, (this.props.autoplaySeconds ?? 3.8) * 1000)
      this.setState({ auto: true })
      if (!this.state.busy) this.next()
    }
  }
  toggleSound() { this.ensureAC(); this.setState(s => ({ sound: !s.sound })) }

  poke() {
    const s = this.state
    if (this._dragged) { this._dragged = false; return }
    if (this.engineMode) return // engine pokes come from the layer's own hitbox
    if (s.busy || s.dragging || s.poking || s.page === 0 || s.dop < 1) return
    const standing = s.pose === 'idle' || s.pose === 'fight' || s.pose === 'spray' || s.pose === 'think'
    if (!standing) return
    this.ensureAC()
    this.sfx('hop')
    const line = pick('poke.line', POKE)
    const anims: ArcKey[] = ['hop', 'spin', 'wob']
    this.setState({ poking: true, pokeAnim: pick('poke.arc', anims), react: line, fidget: null })
    this.to(680, () => this.setState({ poking: false }))
    this.to(1800, () => this.setState(st => (st.react === line ? { react: null } : null)))
  }

  grab(e: React.MouseEvent) {
    const s = this.state
    if (s.busy || s.dragging || s.page === 0 || s.dop < 1) return
    const standing = s.pose === 'idle' || s.pose === 'fight' || s.pose === 'spray' || s.pose === 'think'
    if (!standing) return
    if (e && e.preventDefault) e.preventDefault()
    this._downX = e.clientX; this._downY = e.clientY
    this._maybeDrag = true; this._dragged = false
  }

  startDrag() {
    const s = this.state
    const standing = s.pose === 'idle' || s.pose === 'fight' || s.pose === 'spray' || s.pose === 'think'
    if (s.busy || !standing) { this._maybeDrag = false; return }
    this._dragged = true
    this.ensureAC(); this.sfx('hop')
    this.setState({ dragging: true, pose: 'dangle', fidget: null, dtrans: 'none', react: 'hey!! down!!' })
    this.to(1100, () => this.setState(st => (st.react === 'hey!! down!!' ? { react: null } : null)))
  }

  drop() {
    const s = this.state
    const cx = s.dx + 52, cy = s.dy + 113
    let best = 0, bd = 1e9
    this.geom()[s.page].panels.forEach((pn, i) => { const d = Math.hypot(pn.ax - cx, pn.ay - cy); if (d < bd) { bd = d; best = i } })
    const a = this.anch(s.page, best)
    this.sfx('hop')
    this.setState({
      dragging: false, busy: true, panel: best, pose: 'tuck', react: null,
      dx: a.x, dy: a.y,
      dtrans: 'left .55s ease-out, top .55s cubic-bezier(.3,0,.35,1.35), opacity .25s'
    })
    this.to(560, () => this.setState({ pose: 'land' }))
    this.to(1040, () => {
      const line = pick('drop.line', DROPS)
      this.panelPose()
      this.setState({ busy: false, react: line })
      this.to(1700, () => this.setState(st => (st.react === line ? { react: null } : null)))
    })
  }

  scheduleFidget() {
    if (this.engineMode) return
    this._ft = setTimeout(() => {
      const s = this.state
      if (!s.busy && !s.dragging && !s.poking && s.dop === 1 && s.page > 0 && s.pose === 'idle') {
        const opts = ['hop', 'spin', 'wob', 'wave', 'sneeze', 'chat', 'chat']
        const f = pick('fidget.kind', opts)
        if (f === 'chat') {
          const line = pick('fidget.line', CHATTER)
          this.setState({ react: line })
          this.to(2100, () => this.setState(st => (st.react === line ? { react: null } : null)))
        } else if (f === 'wave') {
          this.setState({ pose: 'wave' })
          this.to(1500, () => { if (this.state.pose === 'wave') this.setState({ pose: 'idle' }) })
        } else if (f === 'sneeze') {
          this.sfx('scrib')
          const line = 'ah— ah— CHOO!'
          this.setState({ pose: 'sneeze', react: line })
          this.to(950, () => { if (this.state.pose === 'sneeze') this.setState({ pose: 'idle' }) })
          this.to(1650, () => this.setState(st => (st.react === line ? { react: null } : null)))
        } else {
          if (f === 'hop') this.sfx('hop')
          this.setState({ fidget: f as ArcKey })
          this.to(750, () => this.setState({ fidget: null }))
        }
      }
      this.scheduleFidget()
    }, scalar('fidget.delayMs', () => 2800 + Math.random() * 3200))
  }

  renderVals() {
    const s = this.state
    const vw = s.vw, vh = s.vh
    const fit = Math.max(0.15, Math.min(vw / 1060, (vh - 60) / 780, 1.1))
    let cx = 460, cy = 330, sc = fit
    const pn = this.geom()[s.page].panels[s.panel]
    if (s.page > 0 && !s.busyFlip && pn) {
      sc = Math.min(vw * 0.62 / (pn.w + 60), (vh - 150) * 0.82 / (pn.h + 100), 1.55)
      sc = Math.max(sc, fit * 0.9, 0.15)
      cx = pn.x + pn.w / 2; cy = pn.y + pn.h / 2 - 26
    }
    if (s.camo && s.page > 0 && !s.busyFlip) {
      sc = Math.max(.15, sc * (s.camo.mult || 1))
      if (s.camo.cx != null) { cx = s.camo.cx; cy = s.camo.cy }
    }
    // Pointer parallax damps to a whisper while an AUTHORED shot (camo) holds —
    // parallax noise during a choreographed move reads as camera drift (Q5).
    const pk = s.camo ? 0.25 : 1
    const px = (((s.mx ?? vw / 2) / vw) - .5) * 12 * pk, py = (((s.my ?? vh / 2) / vh) - .5) * 8 * pk
    const tx = vw / 2 - sc * cx + px, ty = (vh - 70) / 2 - sc * cy + py
    this._cam = { tx: tx, ty: ty, sc: sc }
    const cameraTf = 'translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')'

    const headSX = tx + sc * (s.dx + 52)
    const headSY = ty + sc * (s.dy + 37)
    const lvx = (s.mx ?? vw / 2) - headSX, lvy = (s.my ?? vh / 2) - headSY
    const ld = Math.hypot(lvx, lvy) || 1
    const lookX = Math.max(-2.6, Math.min(2.6, lvx / ld * 2.6))
    const lookY = Math.max(-1.8, Math.min(2.4, lvy / ld * 2.4))
    const headTilt = (Math.max(-3.2, Math.min(3.2, lvx / 55)) * s.face)
    const lookXf = (lookX * s.face)

    const bodySX = tx + sc * (s.dx + 52), bodySY = ty + sc * (s.dy + 62)
    const pd = Math.hypot((s.mx ?? vw / 2) - bodySX, (s.my ?? vh / 2) - bodySY)
    const near = Math.max(0, Math.min(1, (150 * sc - pd) / (150 * sc)))
    const standingNow = s.pose === 'idle' || s.pose === 'fight' || s.pose === 'spray'
    let lean = 0
    if (s.pose === 'walk') lean = 5
    else if (standingNow && !s.busy && !s.dragging) lean = ((s.mx ?? 0) < bodySX ? 1 : -1) * near * 8
    const eyeR = (2 + near * 1.1)

    const pg = (i: number): CSSProperties => {
      const flipped = i < s.page
      let z = flipped ? 2 + i : 40 - i
      if (s.busyFlip && s.flipRange && i >= s.flipRange[0] && i <= s.flipRange[1]) z = 50 + i
      let tf = 'rotateY(' + (flipped ? -179.6 : 0) + 'deg)'
      if (!flipped && i === s.page && s.pageShove) tf += ' translateX(' + s.pageShove + 'px)'
      const jit = (!flipped && i === s.page && s.pageJit) ? '; animation:pagejit .5s linear' : ''
      return styleFromCss('transform:' + tf + '; z-index:' + z + jit)
    }

    const focusStyle = (s.page > 0 && !s.busyFlip && pn)
      ? 'left:' + (pn.x - 12) + 'px; top:' + (pn.y - 12) + 'px; width:' + (pn.w + 24) + 'px; height:' + (pn.h + 24) + 'px; opacity:1'
      : 'left:410px; top:300px; width:100px; height:60px; opacity:0'

    const arc = s.windup ? 'transform-origin:50% 94%; animation:windup .16s ease-in forwards'
      : s.hopping ? 'transform-origin:50% 92%; animation:hoparc ' + (s.hopDur || .92) + 's cubic-bezier(.45,.08,.4,1)'
      : s.diving ? 'animation:diveout .55s ease-in forwards'
      : s.popping ? 'animation:popout .6s cubic-bezier(.3,.7,.4,1)'
      : s.vaulting ? 'transform-origin:50% 92%; animation:vaultarc .5s cubic-bezier(.4,.1,.5,1)'
      : s.pose === 'cheer' ? 'transform-origin:50% 92%; animation:cheerbounce .55s ease-in-out 3'
      : s.pose === 'trip' ? 'transform-origin:50% 96%; animation:triplurch .52s ease-in-out'
      : s.pose === 'sneeze' ? 'transform-origin:50% 92%; animation:achoo .92s cubic-bezier(.4,.02,.5,1)'
      : s.pose === 'land' ? 'transform-origin:50% 92%; animation:settle .52s cubic-bezier(.2,.7,.32,1)'
      : s.squish ? 'transform-origin:50% 96%; animation:squishpop .95s cubic-bezier(.3,.5,.4,1)'
      : s.poking ? POKEARC[s.pokeAnim]
      : s.fidget ? FIDGETARC[s.fidget] : ''

    const tabs: HudTab[] = this.geom().slice(1).map((p, i) => ({
      name: p.name,
      active: s.page === i + 1,
      go: () => { this.ensureAC(); this.flipTo(i + 1) }
    }))

    return {
      cameraTf,
      camTrans: 'transform ' + (s.camo && s.camo.fast ? '.45s' : '.9s') + ' cubic-bezier(.55,.05,.3,1)',
      shakeStyle: styleFromCss(s.shakeOn ? 'animation:camshake .34s linear' : ''),
      pgStyles: this.geom().map((_, i) => pg(i)) as CSSProperties[],
      focusStyle: styleFromCss(focusStyle),
      dashStyle: styleFromCss('left:' + s.dx + 'px; top:' + s.dy + 'px; opacity:' + s.dop + '; transition:' + s.dtrans),
      dashArcStyle: styleFromCss(arc),
      dashFaceTf: 'scaleX(' + s.face + ') rotate(' + (lean * s.face).toFixed(2) + 'deg)',
      pose: s.pose,
      eyeR: Number(eyeR.toFixed(2)),
      lookXf: Number(lookXf.toFixed(2)), lookY: Number(lookY.toFixed(2)), headTilt: Number(headTilt.toFixed(2)),
      reactOn: !!s.react, react: s.react,
      reactStyle: styleFromCss('left:' + (s.dx + 66) + 'px; top:' + (s.dy - 6) + 'px'),
      onPoke: () => this.poke(),
      onGrab: (e: React.MouseEvent) => this.grab(e),
      boomOn: s.boomOn, holeOn: s.holeOn,
      smokeOn: s.smokeOn,
      smokeStyle: styleFromCss('left:' + (s.smokeX - 75) + 'px; top:' + (s.smokeY - 85) + 'px'),
      crackOn: s.crackOn,
      crackStyle: styleFromCss('left:' + (s.crackX - 60) + 'px; top:' + (s.crackY - 75) + 'px'),
      bombFlyOn: s.bombFlyOn,
      bombFlyStyle: styleFromCss('left:' + (s.bombX - 15) + 'px; top:' + (s.bombY - 18) + 'px'),
      holeStyle: styleFromCss('left:' + (s.holeX - 70) + 'px; top:' + (s.holeY - 26) + 'px'),
      boomStyle: styleFromCss('left:' + (s.holeX - 90) + 'px; top:' + (s.holeY - 150) + 'px'),
      snark: s.page === 0 ? this.doc.cover.snark : this.doc.pages[s.page - 1].snark, snarkOn: (this.props.pipSnark ?? true),
      tabs,
      onNext: () => { this.ensureAC(); this.next() },
      onPrev: () => { this.ensureAC(); this.prev() },
      onOpen: () => { this.ensureAC(); if (this.state.page === 0) this.flipTo(1) },
      onAuto: () => this.toggleAuto(),
      onSound: () => this.toggleSound(),
      autoLabel: 'auto: ' + (s.auto ? 'ON' : 'off'),
      soundLabel: 'sound: ' + (s.sound ? 'ON' : 'off'),
      pageLabel: s.page === 0 ? 'cover' : 'pg ' + s.page + '/' + (this.geom().length - 1)
    }
  }

  render() {
    const v = this.renderVals()
    return (
      <div
        data-screen-label="Notebook site"
        style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'radial-gradient(120% 100% at 50% 35%, #b39f82 0%, #8f7b5e 100%)', fontFamily: "'Patrick Hand',cursive", color: '#1a1a1a' }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: 920, height: 660, transformOrigin: '0 0', transition: v.camTrans, willChange: 'transform', transform: v.cameraTf }}>
          <div style={{ width: '100%', height: '100%', ...v.shakeStyle }}>
            {/* spiral binding */}
            <div style={{ position: 'absolute', left: -14, top: 4, bottom: 4, width: 34, background: 'repeating-linear-gradient(#1c1b19 0px, #1c1b19 14px, #26241f 14px, #26241f 18px)', borderRadius: 10, boxShadow: '4px 6px 14px rgba(0,0,0,.3)' }} />

            <div style={{ position: 'absolute', inset: 0, perspective: '2400px' }}>
              {this.doc.pages.map((pd, i) => (
                <PageRenderer key={i} page={pd} style={v.pgStyles[i + 1]} flags={this.state.flags} />
              ))}
              <CoverRenderer cover={this.doc.cover} style={v.pgStyles[0]} onOpen={v.onOpen} />
            </div>

            <FocusRing style={v.focusStyle} />

            {v.holeOn && <Hole style={v.holeStyle} />}
            {v.crackOn && <Crack style={v.crackStyle} />}
            {v.boomOn && <Boom style={v.boomStyle} />}
            {v.smokeOn && <Smoke style={v.smokeStyle} />}
            {v.bombFlyOn && <Bomb style={v.bombFlyStyle} />}

            {this.engineMode ? (
              this.state.page > 0 && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none', visibility: this.state.busyFlip ? 'hidden' : 'visible' }}>
                  <EngineLayer
                    ref={(r) => { this.engineRef = r }}
                    doc={buildEngineDoc(this.doc)}
                    page={Math.max(0, this.state.page - 1)}
                    flags={this.state.flags}
                    onFlag={(flag, value) => this.setState((st) => ({ flags: { ...st.flags, [flag]: value } }))}
                    sfx={(kind) => this.engineSfx(kind)}
                    onPoke={() => { this.ensureAC(); this.sfx('hop') }}
                    onDashCam={(p) => this.setState({ camo: p ? { cx: p.x, cy: p.y, mult: p.mult ?? 0.92, fast: p.fast ?? false } : null })}
                    onFx={(fx) => {
                      // The engine drives the SHARED overlays (legacy staging owns
                      // their look; the engine owns the timing).
                      const st: Partial<State> = {}
                      if (fx.kind === 'bomb') {
                        st.bombFlyOn = fx.on
                        if (fx.on) { st.bombX = fx.x ?? 0; st.bombY = fx.y ?? 0 }
                      } else if (fx.kind === 'boom') {
                        st.boomOn = fx.on
                        if (fx.on) { st.holeX = fx.x ?? 0; st.holeY = fx.y ?? 0 }
                      } else if (fx.kind === 'hole') {
                        st.holeOn = fx.on
                        if (fx.on && fx.x !== undefined) { st.holeX = fx.x; st.holeY = fx.y ?? 0 }
                      } else if (fx.kind === 'smoke') {
                        st.smokeOn = fx.on
                        if (fx.on) { st.smokeX = fx.x ?? 0; st.smokeY = fx.y ?? 0 }
                      } else if (fx.kind === 'crack') {
                        st.crackOn = fx.on
                        if (fx.on) { st.crackX = fx.x ?? 0; st.crackY = fx.y ?? 0 }
                      }
                      this.setState(st as State)
                    }}
                    dropLines={DROPS}
                    pokeLines={POKE}
                    chatterLines={CHATTER}
                  />
                </div>
              )
            ) : (
            <div
              data-dash-actor
              onClick={v.onPoke}
              onMouseDown={v.onGrab}
              style={{ position: 'absolute', width: 104, height: 113, zIndex: 60, pointerEvents: 'auto', cursor: 'pointer', ...v.dashStyle }}
            >
              <div style={{ width: '100%', height: '100%', ...v.dashArcStyle }}>
                <Dash pose={v.pose} faceTf={v.dashFaceTf} headTilt={v.headTilt} lookXf={v.lookXf} lookY={v.lookY} eyeR={v.eyeR} />
              </div>
            </div>
            )}

            {v.reactOn && <ReactBubble style={v.reactStyle} text={v.react ?? ''} />}
            {v.snarkOn && <PipSnark text={v.snark} />}
          </div>
        </div>

        <Hud
          tabs={v.tabs}
          onPrev={v.onPrev}
          onNext={v.onNext}
          onAuto={v.onAuto}
          onSound={v.onSound}
          autoLabel={v.autoLabel}
          soundLabel={v.soundLabel}
          pageLabel={v.pageLabel}
        />
      </div>
    )
  }
}
