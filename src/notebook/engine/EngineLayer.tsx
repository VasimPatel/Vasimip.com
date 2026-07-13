// EngineLayer (P9b) — the engine-driven Dash mounted INSIDE the notebook's page
// space (920×660; world coords == page coords). React (the Notebook class) keeps
// pages/camera/HUD; this layer owns the character: full runtime (behavior +
// locomotion + blender + controllers + verlet secondary + bandana + squash) at a
// fixed 120 Hz sim driven by ONE rAF, rendered by @dash/renderer-svg.
//
// The Notebook drives it imperatively via ref:
//   travelTo(panelIdx)  — pick a behavior from the DESTINATION panel's migrated
//                         pool (weights + when-gates vs the flag store), bind the
//                         travel context, run it; chain the arrival behavior.
//   enterPage(pageIdx)  — rebuild the world for a page; Dash enters at its first
//                         panel's interior spot and runs that arrival.
//   poke()              — expression + squash + secondary/bandana impulses.
// Bridges OUT: intent:setFlag → props.onFlag (site flags drive showIfFlag boxes);
// intent:sfx → props.sfx (AudioEngine mapping lives site-side). Camera intents are
// trace-only in 9b (the Notebook's panel-focus camera already follows travel).

import { Component, createRef, type ReactNode } from 'react'
import {
  createCharacterRuntime,
  createContext,
  createMutableWorld,
  createVerletWorld,
  STEP_MS,
  type CharacterRuntime,
  type EngineContext,
  type MutableWorld,
  type VerletWorld,
} from '../../../packages/engine/src/index'
import { evalGate, type BehaviorDoc, type GateExpr } from '../../../packages/schema/src/index'
import { createCharacterRenderer, type CharacterRenderer } from '../../../packages/renderer-svg/src/index'
import { engineSkins, type EngineDoc } from './engineDoc'
import { pick, chance, scalar, reviewHook, reviewLog, type MotionSample } from '../review'

export interface EngineLayerProps {
  /** The engine doc derived from the SAME v1 doc the site renders (hot-swappable). */
  doc: EngineDoc
  page: number
  /** Site flag store (drives showIfFlag boxes); the layer mirrors engine setFlags. */
  flags: Record<string, boolean>
  onFlag(flag: string, value: boolean): void
  /** Map an sfx kind ('hop', 'whoosh', 'fx:smoke'…) onto the AudioEngine. */
  sfx(kind: string): void
  /** Dash began traveling toward panel j (the Notebook focuses its camera). */
  onHeading?(panelIdx: number): void
  /** The poke hitbox was clicked (the Notebook plays its sfx/AC ensure). */
  onPoke?(): void
  /** Camera: Dash's live position while traveling (follow), or an AUTHORED shot
   * (camera cue: mult = zoom multiplier, fast = tempo — the legacy camo). null =
   * return to panel focus. */
  onDashCam?(p: { x: number; y: number; mult?: number; fast?: boolean } | null): void
  /** Visual effect overlays (bomb/boom/hole/smoke/crack) — the Notebook owns the
   * shared overlay components; the engine drives them for its performances. */
  onFx?(fx: { kind: 'bomb' | 'boom' | 'hole' | 'smoke' | 'crack'; on: boolean; x?: number; y?: number }): void
  /** Quips for the end of a drag (the legacy DROPS list) — spoken via the
   * engine's own bubble so positioning always tracks the figure. */
  dropLines?: string[]
  /** Poke-reaction quips (the legacy POKE list). */
  pokeLines?: string[]
  /** Idle chatter quips (the legacy CHATTER list, for the fidget scheduler). */
  chatterLines?: string[]
}

interface Scene {
  ctx: EngineContext
  verlet: VerletWorld
  mw: MutableWorld
  rt: CharacterRuntime
  pageIdx: number
  offs: Array<() => void>
}

export class EngineLayer extends Component<EngineLayerProps> {
  private svgRef = createRef<SVGSVGElement>()
  private scene: Scene | null = null
  private renderer: CharacterRenderer | null = null
  private bubble: SVGGElement | null = null
  private raf = 0
  private last = 0
  private acc = 0
  private look: { x: number; y: number } | null = null
  private pendingArrival: string | null = null
  private currentPanel = 0
  private pokeBox: HTMLDivElement | null = null

  private get docV2() {
    return this.props.doc.docV2
  }
  private get dash() {
    return this.docV2.characters.dash
  }
  private get rigDoc() {
    return this.docV2.rigs[this.dash.rig]
  }
  /** Destination of the in-flight travel run — poof-recovery lands here if the
   * picked behavior blocks/fails (the legacy poof teleport, driver-owned). */
  private travelDest: number | null = null
  /** Camera-follow throttle + airborne-roll state (render-layer charm). */
  private camTick = 0
  private rolling = false
  private airborne = false
  private spin = 0
  private dragging = false
  private dragMoved = false
  private dragStart: { x: number; y: number } | null = null
  private onDragUp: ((e: MouseEvent) => void) | null = null
  private onDragBlur: (() => void) | null = null
  private backNavCancel: (() => void) | null = null
  /** Legacy charm wrapper around the renderer group: plays the poke/fidget
   * keyframe arcs (pokehop/spin360/pokewob/fidgethop from styles.css).
   * Render-layer only. */
  private arcWrap: SVGGElement | null = null
  private arcTimer = 0
  private fidgetTimer = 0
  /** Smoothed cursor-lean (rad) — the legacy .22s ease-out transition. */
  private lean = 0
  /** An authored camera cue owns the shot (suppresses the follow cam). */
  private camOverride = false
  /** Scripted root motion (back-nav hop-to-hole) — render-layer, like drag. */
  private scriptMove: { fromX: number; fromY: number; toX: number; toY: number; t0: number; dur: number; arcH: number } | null = null
  /** Actor visibility (back-nav dive/poof vanish). */
  private actorHidden = false
  private actorHiddenApplied = false
  /** The NEXT enterPage's staging (back-nav landings replace the entrance stroll). */
  private pendingEntrance: { kind: 'bombPop' | 'poofIn' | 'surfIn'; panel: number } | null = null

  /** The next forward flip rides in surfing (legacy 38% page-surf variant). */
  surfNext(): void {
    this.pendingEntrance = { kind: 'surfIn', panel: 0 }
  }
  /** Back-nav timeline timers (cancellable as a set). */
  private backNavTimers: number[] = []
  /** The panel the current travel departed from (camera midpoint framing). */
  private travelFrom = 0
  /** Back-nav staging window: busy() holds and fidgets stay quiet until then. */
  private stagingUntil = 0
  /** Q0 motion recorder state: sim-tick counter + the last camera target sent. */
  private simTicks = 0
  private lastCam: { x: number; y: number } | null = null
  /** Q2 render interpolation: sim-step snapshots of the root. Presentation-only —
   * the deterministic sim is untouched; a big prev→cur jump (teleport) snaps. */
  private prevSnap: { x: number; y: number } | null = null
  private curSnap: { x: number; y: number } | null = null
  /** Q3 bounded cape secondary: eased velocity lag (rad), reset on teleports/
   * facing flips — momentum must never drag the cape through the body. */
  private capeLag = 0
  private capeFacing: 1 | -1 = 1
  /** The hop-hang variant rolled for the in-flight travel. */
  private pendingHang = false
  /** Adapter speech (trip 'whoa—', hang 'hup—') — shown when the engine bubble
   * is otherwise silent; a real say wins. */
  private bubbleNote: { text: string; until: number } | null = null

  private cancelBackNav(): void {
    this.backNavCancel?.()
  }

  componentDidMount(): void {
    this.enterPage(this.props.page)
    this.last = performance.now()
    const frame = (now: number): void => {
      this.raf = requestAnimationFrame(frame)
      this.acc += Math.min(120, now - this.last)
      this.last = now
      const s = this.scene
      if (!s || !this.renderer) return
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS
        this.prevSnap = this.curSnap
        s.ctx.clock.advance()
        s.rt.tick()
        s.verlet.step()
        s.mw.stepMutations()
        this.curSnap = { x: s.rt.transform.x, y: s.rt.transform.y }
        this.simTicks++
        // The legacy roll: spin the tuck through the arc (~1 turn / 600ms) —
        // advanced PER SIM TICK so rotation speed is refresh-rate independent.
        if (this.rolling && this.airborne) this.spin += (Math.PI * 2 * STEP_MS) / 600
      }
      // Proximity charm (legacy renderVals): pupils dilate and the standing figure
      // tips toward a near cursor; both ease so nothing pops.
      const solved = s.rt.solved()
      const standing = !s.rt.running() && !this.airborne && !this.dragging
      let near = 0
      let leanTarget = 0
      const headBone = solved.bones.find((b) => b.id === 'head')
      if (this.look && headBone) {
        const d = Math.hypot(this.look.x - headBone.ex, this.look.y - headBone.ey)
        near = Math.max(0, Math.min(1, (150 - d) / 150))
        if (standing) leanTarget = (this.look.x < headBone.ex ? 1 : -1) * near * (8 * Math.PI / 180)
      }
      this.lean += (leanTarget - this.lean) * 0.08
      // Pose props (sword, spray can) ride the active strikePose; the fight pose
      // also shuffles the whole figure (the legacy fightshift cycle). With a SKIN
      // active the drawing carries its own props/acting — the renderer suppresses
      // the rig figure and prop layer itself.
      const src = s.rt.activeSource()
      const activePose = src.kind === 'pose' ? this.docV2.poses[src.id] : undefined
      this.syncPoseAct(src.kind === 'pose' ? src.id : null)
      const cap = s.rt.capsule()
      // A skinned source carries its own internal animation (the tuck skin's
      // tuckspin already rotates) — the render-layer roll spin would double it.
      const skinned = EngineLayer.SKINNED.has(src.id)
      // Q0 negative control: injected root stepping — the motion metrics must
      // catch exactly this class of defect (review-forced, never organic).
      const negStep = reviewHook()?.force?.['negctl.step'] ? (this.simTicks & 8 ? 4 : -4) : 0
      // Q1 — ONE visible locomotion authority: while ground-moving, the skin
      // anchors to the SUPPORT LINE (never the bobbing hip/capsule — the skin's
      // own bobw is the only bob) and its walk cycle is PHASE-LOCKED to distance
      // traveled over the drawing's authored stride.
      const pres = s.rt.presentation()
      // Q2 — interpolate the fixed-step root between sim snapshots (alpha = the
      // accumulator remainder). Offsets, not absolutes: scripted/drag motion
      // mutates the transform per-rAF (already continuous) and must not fight
      // the sim snapshots. Teleport-scale jumps snap (poof, page placement).
      const alpha = Math.max(0, Math.min(1, this.acc / STEP_MS))
      let offX = 0
      let offY = 0
      if (this.prevSnap && this.curSnap) {
        const jx = this.prevSnap.x - this.curSnap.x
        const jy = this.prevSnap.y - this.curSnap.y
        if (Math.abs(jx) < 48 && Math.abs(jy) < 48) {
          offX = jx * (1 - alpha)
          offY = jy * (1 - alpha)
        }
      }
      const skinRoot = { x: pres.x + offX, y: (pres.supportY ?? Math.max(cap.y0, cap.y1) + cap.r + offY) + negStep }
      const stride = EngineLayer.STRIDES.get(src.id)
      const phase = stride && pres.groundMoving ? (pres.groundDistance / stride) % 1 : undefined
      // Q3 cape lag: trail the authored cape by horizontal velocity, softly eased,
      // hard-clamped to a small envelope; snap to rest on teleports/facing flips.
      let vx = 0
      if (this.prevSnap && this.curSnap) {
        const jx = this.curSnap.x - this.prevSnap.x
        if (Math.abs(jx) < 48) vx = jx / (STEP_MS / 1000)
      }
      if (pres.facing !== this.capeFacing) {
        this.capeFacing = pres.facing
        this.capeLag = 0
      }
      // facing mirroring flips the group's x-axis, so lag is authored in FACING
      // space: positive = trailing behind the motion.
      const target = Math.max(-0.16, Math.min(0.16, vx * pres.facing * 0.0009))
      this.capeLag += (target - this.capeLag) * 0.1
      this.renderer.render(solved, s.rt.face(), s.rt.overrides(), {
        flourish: s.rt.flourish(),
        spin: this.rolling && this.airborne && !skinned ? this.spin : 0,
        accessories: s.rt.accessories.map((a) => a.points()),
        pupilScale: 1 + 0.55 * near, // legacy eyeR 2 → 3.1 at the cursor
        lean: this.lean,
        props: (activePose as { props?: never[] } | undefined)?.props,
        skinId: src.id,
        skinRoot,
        facing: s.rt.transform.facing as 1 | -1,
        phase,
        offset: { dx: offX, dy: offY },
        capeLag: this.capeLag,
      })
      if (reviewHook()?.motion) this.recordMotion(s, solved, skinRoot, src.id)

      // Camera follows Dash while a travel is in flight (throttled ~9 ticks; the
      // Notebook's CSS cam transition glides between updates) — unless an
      // AUTHORED camera cue owns the shot (cleared by cue or behavior end).
      if (this.travelDest != null && !this.camOverride && ++this.camTick % 9 === 0) {
        this.lastCam = { x: s.rt.transform.x, y: s.rt.transform.y }
        this.props.onDashCam?.(this.lastCam)
      }
      // Scripted root motion (back-nav hop-to-hole): a render-layer arc, exactly
      // like the drag's direct transform drive.
      if (this.scriptMove) {
        const m = this.scriptMove
        const k = Math.min(1, (performance.now() - m.t0) / m.dur)
        const t = s.rt.transform
        t.x = m.fromX + (m.toX - m.fromX) * k
        t.y = m.fromY + (m.toY - m.fromY) * k - m.arcH * 4 * k * (1 - k)
        if (k >= 1) this.scriptMove = null
      }
      if (this.actorHidden !== this.actorHiddenApplied && this.svgRef.current) {
        this.svgRef.current.style.opacity = this.actorHidden ? '0' : '1'
        this.actorHiddenApplied = this.actorHidden
      }
      this.drawBubble()
      // DRAG: while grabbed, the transform follows the cursor (page coords from
      // the Notebook's look feed) with a light ease; the verlet secondary and
      // bandana trail it for free — the legacy grab, reborn on physics.
      if (this.dragging && this.dragMoved && this.look) {
        const t = s.rt.transform
        const ease = 0.45
        const nx = t.x + (this.look.x - t.x) * ease
        const ny = t.y + (this.look.y - 24 - t.y) * ease
        if (Math.abs(nx - t.x) + Math.abs(ny - t.y) > 0.8) this.dragMoved = true
        t.x = nx
        t.y = ny
      }
      // Poke hitbox tracks the figure (the wrapper must NOT catch page-wide
      // clicks — review finding: it swallowed the cover's open handler).
      if (this.pokeBox) {
        const t = s.rt.transform
        this.pokeBox.style.transform = `translate(${t.x - 46}px, ${t.y - 78}px)`
      }
    }
    this.raf = requestAnimationFrame(frame)
    this.scheduleFidget()
  }

  /** Q0 motion recorder: one presentation sample per rAF (review-mode only).
   * The DOM rect read forces layout — acceptable in a review run, never active
   * for real visitors. Capped so a forgotten recorder can't grow unbounded. */
  private recordMotion(s: Scene, solved: ReturnType<CharacterRuntime['solved']>, skinRoot: { x: number; y: number }, srcId: string): void {
    const arr = (window.__dashMotion ??= [])
    if (arr.length >= 30000) return
    const t = s.rt.transform
    const neck = solved.bones.find((b) => b.id === 'neck')
    const pts = s.rt.accessories[0]?.points() ?? []
    const tip = pts[pts.length - 1]
    const rect = this.svgRef.current?.querySelector('[data-dash-renderer]')?.getBoundingClientRect()
    // Q0 negative control: a displaced cape socket the separation metric must flag.
    const sockBias = reviewHook()?.force?.['negctl.socket'] ? 6 : 0
    const sample: MotionSample = {
      t: performance.now(),
      tick: this.simTicks,
      acc: this.acc,
      rootX: t.x,
      rootY: t.y,
      skinX: skinRoot.x,
      skinY: skinRoot.y,
      src: srcId,
      air: this.airborne,
      sockX: (neck?.ex ?? NaN) + sockBias,
      sockY: neck?.ey ?? NaN,
      capeRootX: pts[0]?.x ?? NaN,
      capeRootY: pts[0]?.y ?? NaN,
      capeTipX: tip?.x ?? NaN,
      capeTipY: tip?.y ?? NaN,
      camX: this.lastCam?.x ?? NaN,
      camY: this.lastCam?.y ?? NaN,
      scrX: rect ? rect.x + rect.width / 2 : NaN,
      scrY: rect ? rect.y + rect.height / 2 : NaN,
    }
    arr.push(sample)
  }

  componentDidUpdate(prev: EngineLayerProps): void {
    // Doc hot-swap (server fetch / admin preview) rebuilds the scene on the SAME
    // page; page changes rebuild for the new page.
    if (prev.doc !== this.props.doc || prev.page !== this.props.page) this.enterPage(this.props.page)
  }

  componentWillUnmount(): void {
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.fidgetTimer)
    this.teardown()
  }

  private teardown(): void {
    if (this.onDragUp) window.removeEventListener('mouseup', this.onDragUp)
    if (this.onDragBlur) window.removeEventListener('blur', this.onDragBlur)
    this.onDragUp = null
    this.onDragBlur = null
    this.dragging = false
    this.cancelBackNav()
    // Back-nav landing timers belong to the OLD scene — a navigation during the
    // pop-in/reappear staging must not fire them against the new runtime.
    for (const t of this.backNavTimers) window.clearTimeout(t)
    this.backNavTimers = []
    this.scriptMove = null
    this.actorHidden = false
    this.actorHiddenApplied = false
    this.stagingUntil = 0
    this.prevSnap = null
    this.curSnap = null
    this.capeLag = 0
    if (this.svgRef.current) this.svgRef.current.style.opacity = '1'
    this.clearTravel()
    for (const off of this.scene?.offs ?? []) off()
    this.scene?.rt.dispose()
    this.renderer?.destroy()
    this.renderer = null
    window.clearTimeout(this.arcTimer)
    this.arcWrap?.remove()
    this.arcWrap = null
    this.lean = 0
    this.bubble?.remove()
    this.bubble = null
    this.scene = null
  }

  /** Build the scene for a page; Dash enters at panel 0's interior spot. */
  enterPage(pageIdx: number): void {
    const svg = this.svgRef.current
    const pw = this.props.doc.pageWorlds[pageIdx]
    if (!svg || !pw) return
    this.teardown()

    const ctx = createContext({ seed: reviewHook()?.seed ?? (Math.random() * 0xffffffff) >>> 0 })
    const verlet = createVerletWorld()
    const dash = this.dash
    const rig = this.rigDoc
    const mw = createMutableWorld(pw.world, { character: dash, events: ctx.events, stepMs: STEP_MS })
    const rt = createCharacterRuntime({
      rig,
      character: dash,
      world: mw,
      verlet,
      rng: ctx.rng,
      events: ctx.events,
      clips: this.docV2.clips,
      poses: this.docV2.poses,
      behaviors: this.docV2.behaviors,
      names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
      restPose: this.docV2.poses.stand,
      initialTransform: { x: 0, y: 0, rot: 0, facing: 1 },
      accessories: true,
      getLookTarget: () => this.look,
    })

    // Enter at the first panel's interior spot, feet on its line.
    const first = pw.world.entities.find((e) => e.components.surface)
    // Back-nav landings (bomb pop-out / poof reappear) spawn at the LANDING
    // panel (legacy: the last panel of the previous page); everything else
    // spawns at panel 0 for the entrance stroll.
    const pe = this.pendingEntrance
    this.pendingEntrance = null
    const spawnPanel = pe ? Math.max(0, Math.min((this.docV2.pages[pageIdx]?.panels.length ?? 1) - 1, pe.panel)) : 0
    const spot = this.panelSpot(pageIdx, spawnPanel) ?? { x: 120, y: 300 }
    rt.transform.x = spot.x
    const cap = rt.capsule()
    rt.transform.y += spot.y - (cap.y1 + cap.r)
    void first

    const offs = [
      ...(import.meta.env.DEV
        ? [
            ctx.events.on('intent:failed', (p) => console.info('[engine] intent:failed ' + JSON.stringify(p))),
            ctx.events.on('intent:blocked', (p) => console.info('[engine] intent:blocked ' + JSON.stringify(p))),
            ctx.events.on('behavior:start', (p) => console.info('[engine] behavior:start ' + JSON.stringify(p))),
            ctx.events.on('watchdog:forced-release', (p) => console.info('[engine] watchdog', p)),
          ]
        : []),
      ctx.events.on('intent:setFlag', (p) => {
        const { flag, value } = p as { flag: string; value?: boolean }
        this.props.onFlag(flag, value ?? true)
      }),
      ctx.events.on('intent:sfx', (p) => {
        const kind = (p as { kind: string }).kind
        // fx sounds carry their VISUALS now (review: audio announced effects that
        // never appeared) — crack/smoke overlays spawn at Dash, legacy-timed.
        if (kind === 'fx:crack') {
          const c = rt.capsule()
          this.props.onFx?.({ kind: 'crack', on: true, x: rt.transform.x + rt.transform.facing * 30, y: Math.max(c.y0, c.y1) + c.r - 55 })
          this.backNavTimers.push(window.setTimeout(() => this.props.onFx?.({ kind: 'crack', on: false }), 1650))
        } else if (kind === 'fx:smoke') {
          const c = rt.capsule()
          this.props.onFx?.({ kind: 'smoke', on: true, x: rt.transform.x, y: Math.max(c.y0, c.y1) + c.r - 53 })
          this.backNavTimers.push(window.setTimeout(() => this.props.onFx?.({ kind: 'smoke', on: false }), 700))
        }
        this.props.sfx(kind)
      }),
      // Camera cues (parity Stage 2c): authored shots override the follow cam.
      // A travel-bound target in flight frames the MIDPOINT of Dash and the
      // destination (the legacy vault/rope composition); omitted `to` = clear.
      ctx.events.on('intent:camera', (p) => {
        const c = p as { to?: string; mult?: number; fast?: boolean }
        if (!c.to) {
          this.camOverride = false
          this.props.onDashCam?.(null)
          return
        }
        const pt = this.resolveCamTarget(c.to)
        if (!pt) return
        const inFlight = this.travelDest != null
        const cx = inFlight ? (rt.transform.x + pt.x) / 2 : pt.x
        const cy = inFlight ? pt.y - 26 : pt.y - 40
        this.camOverride = true
        this.lastCam = { x: cx, y: cy }
        this.props.onDashCam?.({ x: cx, y: cy, mult: c.mult, fast: c.fast })
      }),
      ctx.events.on('jump:launch', () => {
        this.airborne = true
      }),
      ctx.events.on('jump:land', () => {
        this.airborne = false
        this.spin = 0
      }),
      ctx.events.on('behavior:interrupted', () => {
        this.airborne = false
        this.rolling = false
        this.spin = 0
      }),
      ctx.events.on('behavior:complete', () => {
        this.travelDest = null
        this.camOverride = false
        this.props.onDashCam?.(null)
        if (this.pendingHang) {
          this.pendingHang = false
          this.hangStaging() // ends with chainArrival
          return
        }
        this.chainArrival()
      }),
      // One-shot endings (reason = our '__' labels: staged landing beats, quips,
      // flourishes) must NOT chain arrivals/recovery — the staged timeline owns
      // that moment (review: a landing one-shot consumed the arrival early and
      // the timer's later chainArrival double-ran the flourish roll).
      ctx.events.on('behavior:ended', (p) => {
        if (String((p as { reason?: string }).reason ?? '').startsWith('__')) return
        this.recoverOrArrive()
      }),
      ctx.events.on('behavior:halted', () => this.recoverOrArrive()),
    ]

    this.scene = { ctx, verlet, mw, rt, pageIdx, offs }
    this.currentPanel = spawnPanel
    // Review surface: the engine's own event trace, exposed for the parity harness
    // (normalized timeline). Only present when the review hook is installed.
    if (reviewHook()) {
      ;(window as unknown as { __dashEngineTrace?: () => readonly unknown[] }).__dashEngineTrace = () => ctx.events.trace()
    }
    // Face-level calibration: the head bone's world angle in the rest pose.
    const stand = this.docV2.poses.stand?.angles ?? {}
    const faceRestAngle = (stand.pelvis ?? 0) + (stand.neck ?? 0) + (stand.head ?? 0)
    this.renderer = createCharacterRenderer(svg, dash, rig, { faceRestAngle, skins: engineSkins })
    // Wrap the renderer group so the legacy CSS keyframe arcs (pokehop, spin360,
    // pokewob, fidgethop — already in styles.css) can play on the whole figure
    // without fighting the renderer's own squash/spin/lean transform.
    const NS = 'http://www.w3.org/2000/svg'
    const rg = svg.querySelector('[data-dash-renderer]')
    if (rg) {
      const arc = document.createElementNS(NS, 'g') as SVGGElement
      svg.insertBefore(arc, rg)
      arc.appendChild(rg)
      this.arcWrap = arc
    }
    this.makeBubble(svg)

    this.pendingArrival = this.arrivalId(pageIdx, spawnPanel)

    // Back-nav landing staging (legacy bombBack 3300–4230 / poofBack 1520–2150,
    // offsets re-based to the page-turn moment done() fired at).
    if (pe?.kind === 'bombPop') {
      this.actorHidden = true
      this.stagingUntil = performance.now() + 1800
      const at = (ms: number, fn: () => void): void => {
        this.backNavTimers.push(window.setTimeout(fn, ms))
      }
      at(870, () => {
        this.props.onFx?.({ kind: 'hole', on: true, x: spot.x, y: spot.y })
        this.actorHidden = false
        this.props.sfx('hop')
        rt.runOneShot('__backnav:pop', [{ verb: 'strikePose', ref: 'jump-tuck', holdMs: 560 }])
        this.playArc('pop', false)
      })
      at(1470, () => {
        rt.runOneShot('__backnav:popland', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 300 }])
        ctx.events.emit('jump:land', { characterId: this.dash.id }) // squash ring
      })
      at(1800, () => {
        this.props.onFx?.({ kind: 'hole', on: false })
        this.chainArrival()
      })
      return
    }
    if (pe?.kind === 'surfIn') {
      // Legacy page-surf: Dash rides the flip in, hangs above the anchor in the
      // surf art, then drops with a tuck and lands (legacy 880/1240/1780 beats,
      // re-based to the flip's end — the engine actor shows post-busyFlip).
      this.stagingUntil = performance.now() + 1000
      const t0 = rt.transform
      t0.y -= 96
      rt.act('surf', { holdMs: 'persist' })
      const at = (ms: number, fn: () => void): void => {
        this.backNavTimers.push(window.setTimeout(fn, ms))
      }
      at(60, () => {
        this.props.sfx('hop')
        rt.act('jump-tuck', { holdMs: 400 })
        this.scriptMove = { fromX: t0.x, fromY: t0.y, toX: t0.x, toY: t0.y + 96, t0: performance.now(), dur: 340, arcH: 0 }
      })
      at(420, () => {
        rt.clearAct()
        rt.runOneShot('__surf:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
        this.props.sfx('fx:shake')
      })
      at(960, () => this.chainArrival())
      return
    }
    if (pe?.kind === 'poofIn') {
      this.actorHidden = true
      this.stagingUntil = performance.now() + 1500
      const at = (ms: number, fn: () => void): void => {
        this.backNavTimers.push(window.setTimeout(fn, ms))
      }
      at(870, () => this.props.onFx?.({ kind: 'smoke', on: true, x: spot.x, y: spot.y - 53 }))
      at(1010, () => {
        this.actorHidden = false
        rt.runOneShot('__backnav:poofland', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 300 }])
      })
      at(1350, () => this.chainArrival())
      at(1500, () => this.props.onFx?.({ kind: 'smoke', on: false }))
      return
    }

    // Entrance: the legacy Dash STROLLS IN from the panel's left edge before the
    // arrival plays (enterPage ran him in from offscreen at 1.25s). Engine-native:
    // spawn at the left end of panel 0's support line, walk to the anchor. Short
    // lines (< 60 px of walk) skip the stroll — a two-step shuffle reads as jitter.
    const pn0 = this.docV2.pages[pageIdx]?.panels[0]
    const walkDoc = this.docV2.behaviors['builtin:walk']
    const entryDist = pn0 ? spot.x - (pn0.x + 10) : 0
    if (pn0 && walkDoc && entryDist >= 60) {
      rt.transform.x = pn0.x + 10
      rt.transform.facing = 1
      this.travelDest = 0
      this.props.sfx('scrib')
      rt.runBehavior(walkDoc, {
        travel: { from: `panel:${pageIdx}:0`, to: `panel:${pageIdx}:0` },
        // legacy entrance pace (Q4): the same ordinary-walk duration bounds.
        defaultSpeed: entryDist / Math.min(2.2, Math.max(0.7, entryDist / 190)),
      })
      return
    }
    this.chainArrival()
  }

  /** The Notebook's nav: Dash travels to panel j on the current page. */
  travelTo(panelIdx: number): void {
    const s = this.scene
    if (!s) return
    const doc = this.pickTravel(s.pageIdx, panelIdx)
    this.startTravel(doc, panelIdx)
  }

  /** Shared travel launch (nav + the admin/harness testBehavior): poof interception,
   * the legacy in-routine variant dice (trip/hang), and the behavior run itself. */
  private startTravel(doc: BehaviorDoc, panelIdx: number): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const fromId = `panel:${pageIdx}:${this.currentPanel}`
    const toId = `panel:${pageIdx}:${panelIdx}`
    // POOF is code choreography (legacy poofTo): vanish + teleport + reappear —
    // there is no teleport verb, deliberately (the sim never cheats; the ADAPTER
    // may, exactly like legacy CSS did).
    if (doc.id === 'builtin:poof') {
      this.poofTravel(panelIdx)
      return
    }
    // clearTravel FIRST — it nulls pendingArrival (review BLOCKER: the old order
    // set the arrival and then wiped it, so travel arrivals never played).
    this.clearTravel()
    this.travelFrom = this.currentPanel
    this.pendingArrival = this.arrivalId(pageIdx, panelIdx)
    this.currentPanel = panelIdx
    this.travelDest = panelIdx
    this.rolling = doc.id === 'builtin:roll' || doc.id === 'builtin:hop' || doc.id === 'builtin:combo'
    this.spin = 0
    this.props.onHeading?.(panelIdx)

    // Legacy in-routine variants (adapter dice, review-forceable):
    // walk TRIP — 28% on walks longer than a second, at 42% of the stroll.
    const from = this.panelSpot(pageIdx, this.travelFrom)
    const to = this.panelSpot(pageIdx, panelIdx)
    if (doc.id === 'builtin:walk' && from && to) {
      const durMs = (Math.hypot(to.x - from.x, to.y - from.y) / 111.6) * 1000
      if (durMs > 1000 && chance('walk.trip', 0.28)) {
        this.backNavTimers.push(
          window.setTimeout(() => {
            if (this.travelDest === panelIdx && s.rt.running() && !this.airborne) {
              this.props.sfx('hop')
              s.rt.act('trip', { holdMs: 520 })
              this.bubbleNote = { text: 'whoa—', until: performance.now() + 900 }
            }
          }, durMs * 0.42),
        )
      }
    }
    // hop HANG — 25% when the destination anchor hugs the panel top.
    const pn = this.docV2.pages[pageIdx]?.panels[panelIdx]
    this.pendingHang = doc.id === 'builtin:hop' && !!pn && pn.anchor.dy <= 6 && chance('hop.hang', 0.25)

    // Q4 — the legacy ordinary-walk timing policy: duration = clamp(dist/190,
    // 0.7s, 2.2s), expressed as a per-run default ground speed (authored step
    // speeds always win, so approaches/crossings keep their legacy classes).
    let defaultSpeed: number | undefined
    if (doc.id === 'builtin:walk' && from && to) {
      const dist = Math.hypot(to.x - from.x, to.y - from.y)
      if (dist > 1) defaultSpeed = dist / Math.min(2.2, Math.max(0.7, dist / 190))
    }

    s.rt.runBehavior(doc, { travel: { from: fromId, to: toId }, defaultSpeed })
  }

  /** Legacy poofTo: smoke → vanish (150) → TELEPORT under cover (520) → smoke at
   * the destination (620) → reappear + land (760) → arrival (1240); smoke clears
   * at 1350. Render-layer teleport, like the legacy CSS version. */
  private poofTravel(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const spot = this.panelSpot(pageIdx, destIdx)
    if (!spot) return
    this.clearTravel() // FIRST — it nulls pendingArrival (same review blocker)
    this.travelFrom = this.currentPanel
    this.pendingArrival = this.arrivalId(pageIdx, destIdx)
    this.currentPanel = destIdx
    this.stagingUntil = performance.now() + 1350
    this.props.onHeading?.(destIdx)
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const gy = Math.max(cap.y0, cap.y1) + cap.r
    this.props.sfx('flip')
    this.props.onFx?.({ kind: 'smoke', on: true, x: t.x, y: gy - 53 })
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    at(150, () => {
      this.actorHidden = true
    })
    at(520, () => {
      this.props.onFx?.({ kind: 'smoke', on: false })
      t.x = spot.x
      const c2 = s.rt.capsule()
      t.y += spot.y - (Math.max(c2.y0, c2.y1) + c2.r)
    })
    at(620, () => {
      this.props.onFx?.({ kind: 'smoke', on: true, x: spot.x, y: spot.y - 53 })
      this.props.sfx('flip')
    })
    at(760, () => {
      this.actorHidden = false
      s.rt.runOneShot('__poof:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 300 }])
      this.props.sfx('poof')
    })
    at(1240, () => this.chainArrival())
    at(1350, () => this.props.onFx?.({ kind: 'smoke', on: false }))
  }

  /** Legacy hop-hang: land under the lip, dangle with kicking legs and a 'hup—',
   * then pull up, tuck, and settle — staged AFTER the hop behavior completes. */
  private hangStaging(): void {
    const s = this.scene
    if (!s) return
    const t = s.rt.transform
    this.stagingUntil = performance.now() + 1950
    this.props.sfx('hop')
    this.props.sfx('fx:shake')
    this.scriptMove = { fromX: t.x, fromY: t.y, toX: t.x, toY: t.y + 102, t0: performance.now(), dur: 130, arcH: 0 }
    s.rt.act('hang', { holdMs: 'persist' })
    this.bubbleNote = { text: 'hup—', until: performance.now() + 900 }
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    at(970, () => {
      this.props.sfx('whoosh')
      s.rt.act('jump-tuck', { holdMs: 440 })
      this.scriptMove = { fromX: t.x, fromY: t.y, toX: t.x, toY: t.y - 102, t0: performance.now(), dur: 400, arcH: 0 }
    })
    at(1410, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__hang:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
    })
    at(1950, () => this.chainArrival())
  }

  /** A travel run blocked/failed → the legacy escape hatch: POOF. Smoke, teleport
   * to the destination spot (driver-owned placement, like enterPage), arrival. */
  private recoverOrArrive(): void {
    const s = this.scene
    if (!s) return
    const dest = this.travelDest
    this.travelDest = null
    this.camOverride = false
    this.props.onDashCam?.(null)
    if (dest != null) {
      const spot = this.panelSpot(s.pageIdx, dest)
      if (spot) {
        this.props.sfx('fx:smoke')
        s.rt.transform.x = spot.x
        const cap = s.rt.capsule()
        s.rt.transform.y += spot.y - (cap.y1 + cap.r)
        this.props.sfx('poof')
      }
    }
    this.chainArrival()
  }

  /** Resolve a camera-cue TargetRef against the live scene (the common refs the
   * authored shots use — travel:to/from spots and panel anchors). */
  private resolveCamTarget(ref: string): { x: number; y: number } | null {
    const s = this.scene
    if (!s) return null
    if (ref.startsWith('travel:')) {
      const which = ref.slice('travel:'.length).split('#')[0]
      const idx = which === 'to' ? (this.travelDest ?? this.currentPanel) : this.travelFrom
      return this.panelSpot(s.pageIdx, idx)
    }
    if (ref === 'entity:dash') return { x: s.rt.transform.x, y: s.rt.transform.y }
    return null
  }

  /** Back-nav spectacle — the FULL legacy staging (parity Stage 2c). The engine
   * owns the character beats and drives the Notebook's shared overlays through
   * onFx; `done()` fires at the legacy page-turn moment (bomb 2430ms / poof
   * 650ms) and the landing plays via pendingEntrance in the next enterPage.
   * `landingPanel` is the last panel of the TARGET page (legacy lands there). */
  backNav(kind: 'bomb' | 'poof', landingPanel: number, done: () => void): void {
    const s = this.scene
    if (!s) {
      done()
      return
    }
    this.cancelBackNav() // supersession: a new back-nav cancels the previous
    this.clearArc()
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    let called = false
    const fire = (): void => {
      if (called) return
      called = true
      this.backNavCancel = null
      done()
    }
    this.backNavCancel = () => {
      called = true
      for (const t of this.backNavTimers) window.clearTimeout(t)
      this.backNavTimers = []
      this.scriptMove = null
      this.actorHidden = false
      this.pendingEntrance = null
      this.props.onFx?.({ kind: 'bomb', on: false })
      this.props.onFx?.({ kind: 'boom', on: false })
      this.props.onFx?.({ kind: 'hole', on: false })
      this.props.onFx?.({ kind: 'smoke', on: false })
      this.backNavCancel = null
    }

    const t = s.rt.transform
    const cap = s.rt.capsule()
    const gx = t.x
    const gy = Math.max(cap.y0, cap.y1) + cap.r
    this.stagingUntil = performance.now() + (kind === 'bomb' ? 2430 : 650)

    if (kind === 'bomb') {
      // Legacy bombBack: throw 300 → bomb arc 580 → boom+hole 950 → hop 1300 →
      // dive 1850 → page turn 2430 (pop-in + land play on the landing page).
      const dirT = gx > 460 ? -1 : 1
      const txp = Math.max(90, Math.min(830, gx + dirT * 175))
      t.facing = dirT
      s.rt.runOneShot('__backnav:throw', [{ verb: 'strikePose', ref: 'throw', holdMs: 320 }])
      this.props.sfx('scrib')
      at(300, () => this.props.onFx?.({ kind: 'bomb', on: true, x: gx + dirT * 14, y: gy - 75 }))
      at(360, () => this.props.onFx?.({ kind: 'bomb', on: true, x: txp, y: gy - 12 }))
      at(950, () => {
        this.props.onFx?.({ kind: 'bomb', on: false })
        this.props.onFx?.({ kind: 'boom', on: true, x: txp, y: gy })
        this.props.onFx?.({ kind: 'hole', on: true, x: txp, y: gy })
        this.props.sfx('boom')
      })
      at(1300, () => {
        this.props.sfx('hop')
        s.rt.runOneShot('__backnav:tuck', [{ verb: 'strikePose', ref: 'jump-tuck', holdMs: 620 }])
        this.scriptMove = { fromX: t.x, fromY: t.y, toX: txp, toY: t.y, t0: performance.now(), dur: 500, arcH: 46 }
      })
      at(1850, () => {
        this.playArc('dive', false)
      })
      at(2350, () => {
        this.actorHidden = true
      })
      at(2430, () => {
        this.props.onFx?.({ kind: 'boom', on: false })
        this.props.onFx?.({ kind: 'hole', on: false })
        this.pendingEntrance = { kind: 'bombPop', panel: landingPanel }
        this.props.sfx('flip')
        fire()
      })
    } else {
      // Legacy poofBack: smoke 0 → vanish 140 → page turn 650 (smoke + reappear
      // play on the landing page).
      this.props.sfx('flip')
      this.props.onFx?.({ kind: 'smoke', on: true, x: gx, y: gy - 53 })
      at(140, () => {
        this.actorHidden = true
      })
      at(650, () => {
        this.props.onFx?.({ kind: 'smoke', on: false })
        this.pendingEntrance = { kind: 'poofIn', panel: landingPanel }
        this.props.sfx('flip')
        fire()
      })
    }
  }

  /** Dev-hook surface (admin Test buttons + harness): run a specific behavior id
   * toward the farthest panel, exactly like the legacy hooks did. Goes through
   * startTravel so the variant dice (trip/hang/peek) and poof choreography run
   * identically to organic navigation — the harness reviews the REAL paths. */
  testBehavior(behaviorId: string): boolean {
    const s = this.scene
    const base = this.docV2.behaviors[behaviorId]
    const doc = base ? this.applyVariant(base) : base
    if (!s || !doc) return false
    const pageIdx = s.pageIdx
    const panels = this.docV2.pages[pageIdx]?.panels ?? []
    if (panels.length === 0) return false
    const here = this.panelSpot(pageIdx, this.currentPanel) ?? { x: s.rt.transform.x, y: s.rt.transform.y }
    let far = 0
    let farD = -1
    panels.forEach((_, i) => {
      const sp = this.panelSpot(pageIdx, i)
      const d = sp ? Math.abs(sp.x - here.x) : -1
      if (d > farD) { farD = d; far = i }
    })
    this.startTravel(doc, far)
    return true
  }

  busy(): boolean {
    return (this.scene?.rt.running() ?? false) || performance.now() < this.stagingUntil
  }

  poke(): void {
    const s = this.scene
    if (!s) return
    s.ctx.events.emit('expression:poke', { characterId: this.dash.id })
    s.verlet.applyImpulse(`secondary:${this.dash.id}`, 70, -140)
    for (const a of s.rt.accessories) s.verlet.applyImpulse(a.bodyId, 120, -100)
    // The legacy reaction: a random whole-figure arc + a quip — only when he's
    // actually standing around (legacy gated pokes on `standing`).
    if (!s.rt.running() && !this.dragging && !this.airborne && performance.now() >= this.stagingUntil) {
      const arcs: Array<'hop' | 'spin' | 'wob'> = ['hop', 'spin', 'wob']
      this.playArc(pick('poke.arc', arcs), false)
      const lines = this.props.pokeLines
      if (lines && lines.length > 0) {
        const line = pick('poke.line', lines)
        s.rt.runOneShot('__poke:quip', [{ verb: 'say', text: line }])
      }
    }
  }

  setLook(x: number, y: number): void {
    this.look = { x, y }
  }

  /** The Notebook forwards raw client coords so the drag can detect real pointer
   * movement while in flight (page-coord look alone can't — review blocker). */
  notePointer(clientX: number, clientY: number): void {
    if (this.dragging && this.dragStart && !this.dragMoved) {
      if (Math.hypot(clientX - this.dragStart.x, clientY - this.dragStart.y) > 5) this.dragBecameReal()
    }
  }

  private beginDrag(e: { clientX: number; clientY: number }): void {
    const s = this.scene
    // No grabs during staged spectacles (back-nav/poof/hang landings) — a drag
    // would fight the timeline's scripted motion (review blocker; legacy gated
    // grabs on busy the same way).
    if (!s || this.dragging || performance.now() < this.stagingUntil) return
    this.dragging = true
    this.dragMoved = false
    this.dragStart = { x: e.clientX, y: e.clientY }
    // NOTHING is interrupted yet — a mid-jump CLICK must not cancel the trip
    // (review: pointer-down cleared travel before click/drag were distinguished).
    // The interruption happens in dragBecameReal(), on real pointer movement.
    this.onDragUp = (ev) => {
      if (this.dragStart && Math.hypot(ev.clientX - this.dragStart.x, ev.clientY - this.dragStart.y) > 5) {
        this.dragBecameReal()
      }
      this.endDrag()
    }
    this.onDragBlur = () => this.endDrag()
    window.addEventListener('mouseup', this.onDragUp)
    window.addEventListener('blur', this.onDragBlur)
  }

  /** The grab crossed the drag threshold — NOW it interrupts travel/behaviors
   * (idempotent; called from notePointer or the mouseup distance check). */
  private dragBecameReal(): void {
    const s = this.scene
    if (this.dragMoved || !s) {
      this.dragMoved = true
      return
    }
    this.dragMoved = true
    this.clearTravel()
    if (s.rt.running()) s.rt.forceRelease()
    s.ctx.events.emit('expression:poke', { characterId: this.dash.id })
    // The legacy grab staging: dangle art (kicking legs) + the protest quip.
    this.props.sfx('hop')
    s.rt.act('dangle', { holdMs: 'persist' })
    this.bubbleNote = { text: 'hey!! down!!', until: performance.now() + 1100 }
  }

  /** Centralized travel/flight teardown: camera released, spin/roll cleared,
   * any in-flight fidget/poke arc stopped (review: a wrapper animation kept
   * rotating about its OLD world origin while Dash flew elsewhere). */
  private clearTravel(): void {
    this.travelDest = null
    this.pendingArrival = null
    this.pendingHang = false // a superseded hop must not attach hang staging later
    this.rolling = false
    this.airborne = false
    this.spin = 0
    this.camOverride = false
    this.lastCam = null
    this.clearArc()
    this.props.onDashCam?.(null)
  }

  private clearArc(): void {
    window.clearTimeout(this.arcTimer)
    this.actPose = null
    if (this.arcWrap) this.arcWrap.style.animation = ''
  }

  /** Pose-scoped whole-figure acting: the legacy Fight shuffles (fightshift) for
   * as long as the pose holds. Uses the same wrapper as the one-shot arcs — a
   * running behavior means no fidget/poke arc can race it. SKINNED poses carry
   * their own groupAnim (the fight skin fightshifts itself) — the wrapper act is
   * the rig-figure fallback only, or it would double the shuffle. */
  private static POSE_ACTS: Record<string, string> = {
    fight: 'fightshift 2.6s ease-in-out infinite',
  }

  private static SKINNED = new Set(engineSkins.docs.flatMap((d) => d.sources))

  /** Source id → authored stride (px) for phase-driven skins (Q1). */
  private static STRIDES = new Map(
    engineSkins.docs.filter((d) => d.strideLen !== undefined).flatMap((d) => d.sources.map((s) => [s, d.strideLen as number] as const)),
  )

  private actPose: string | null = null

  private syncPoseAct(poseId: string | null): void {
    const anim = poseId && !EngineLayer.SKINNED.has(poseId) ? EngineLayer.POSE_ACTS[poseId] : undefined
    const want = anim ? poseId : null
    if (this.actPose === want) return
    const w = this.arcWrap
    if (!w) return
    if (want && anim) {
      const pts = this.figurePoints()
      if (!pts) return
      window.clearTimeout(this.arcTimer)
      w.style.transformBox = 'view-box'
      w.style.transformOrigin = pts.ground
      w.style.animation = anim
    } else {
      w.style.animation = ''
    }
    this.actPose = want
  }

  private endDrag(): void {
    if (this.onDragUp) window.removeEventListener('mouseup', this.onDragUp)
    if (this.onDragBlur) window.removeEventListener('blur', this.onDragBlur)
    this.onDragUp = null
    this.onDragBlur = null
    this.dragStart = null
    if (!this.dragging) return
    this.dragging = false
    const s = this.scene
    if (!s) return
    // A stationary grab is a CLICK — no settle/thud/quip; the click handler pokes.
    if (!this.dragMoved) return
    // THE LEGACY RELEASE (Stage 6): pick the NEAREST panel anchor, throw a 550ms
    // tuck return arc at it, land with the squash ring, re-run the panel arrival
    // (legacy panelPose — once-flags gate replays), and ALWAYS deliver a DROPS
    // quip. A drop into the void can't happen: the nearest anchor is the target.
    const t = s.rt.transform
    const pageIdx = s.pageIdx
    const panels = this.docV2.pages[pageIdx]?.panels ?? []
    let best = this.currentPanel
    let bd = Infinity
    panels.forEach((_, i) => {
      const sp = this.panelSpot(pageIdx, i)
      const d = sp ? Math.hypot(sp.x - t.x, sp.y - t.y) : Infinity
      if (d < bd) {
        bd = d
        best = i
      }
    })
    const spot = this.panelSpot(pageIdx, best)
    if (!spot) return
    this.currentPanel = best
    this.pendingArrival = this.arrivalId(pageIdx, best)
    this.stagingUntil = performance.now() + 1100
    this.props.sfx('hop')
    s.rt.act('jump-tuck', { holdMs: 560 })
    const cap = s.rt.capsule()
    const footY = Math.max(cap.y0, cap.y1) + cap.r
    this.scriptMove = { fromX: t.x, fromY: t.y, toX: spot.x, toY: t.y + (spot.y - footY), t0: performance.now(), dur: 550, arcH: 26 }
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    at(560, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__drop:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 300 }])
      s.ctx.events.emit('jump:land', { characterId: this.dash.id }) // squash flourish
      this.props.sfx('thud')
    })
    at(1040, () => {
      this.chainArrival()
      const lines = this.props.dropLines
      if (lines && lines.length > 0) {
        // the site bubble (non-interrupting) — the arrival may be speaking too,
        // and legacy showed the drop quip regardless.
        this.bubbleNote = { text: pick('drop.line', lines), until: performance.now() + 1700 }
      }
    })
  }

  // ── charm layer (render-only; replays the legacy keyframes verbatim) ─────────
  /** Anchor points for whole-figure animations, in WORLD coords (the svg viewBox
   * is the page space, so world px == origin px). fill-box percentages are
   * unusable here: the wrapper's bbox includes the cape, which drags a "50%"
   * origin sideways — the spin swept an arc instead of turning in place. */
  private figurePoints(): { ground: string; mid: string } | null {
    const s = this.scene
    if (!s) return null
    const cap = s.rt.capsule()
    const x = s.rt.transform.x
    const top = Math.min(cap.y0, cap.y1) - cap.r
    const bottom = Math.max(cap.y0, cap.y1) + cap.r
    return { ground: `${x}px ${bottom}px`, mid: `${x}px ${(top + bottom) / 2}px` }
  }

  /** Play a one-shot legacy arc on the whole figure. Timings verbatim from
   * POKEARC/FIDGETARC in constants.ts; origins at the live figure points. */
  private playArc(kind: 'hop' | 'spin' | 'wob' | 'dive' | 'pop', fidget: boolean): void {
    const w = this.arcWrap
    const pts = this.figurePoints()
    if (!w || !pts) return
    const spec =
      kind === 'spin'
        ? { origin: pts.mid, anim: `spin360 ${fidget ? '.6s' : '.55s'} cubic-bezier(.5,.1,.4,1)`, ms: fidget ? 650 : 600 }
        : kind === 'dive'
          ? { origin: pts.mid, anim: 'diveout .55s ease-in forwards', ms: 560 }
          : kind === 'pop'
            ? { origin: pts.ground, anim: 'popout .6s cubic-bezier(.3,.7,.4,1)', ms: 620 }
            : kind === 'hop'
              ? fidget
                ? { origin: pts.ground, anim: 'fidgethop .7s cubic-bezier(.4,.1,.3,1)', ms: 750 }
                : { origin: pts.ground, anim: 'pokehop .5s cubic-bezier(.4,.1,.3,1)', ms: 550 }
              : { origin: pts.ground, anim: `pokewob ${fidget ? '.7s' : '.65s'} ease-in-out`, ms: fidget ? 750 : 700 }
    window.clearTimeout(this.arcTimer)
    w.style.transformBox = 'view-box'
    w.style.transformOrigin = spec.origin
    w.style.animation = 'none'
    void w.getBoundingClientRect() // restart the animation
    w.style.animation = spec.anim
    this.arcTimer = window.setTimeout(() => {
      w.style.animation = ''
    }, spec.ms)
  }

  /** The legacy fidget scheduler: every 2.8–6 s an idle Dash hops, spins, wobbles,
   * waves, sneezes, or chatters (chat weighted double). Site-side randomness — the
   * deterministic core is untouched (same class as the travel-pool pick). */
  private scheduleFidget(): void {
    this.fidgetTimer = window.setTimeout(() => {
      const s = this.scene
      // props.page is the ENGINE page index (0-based content page — the layer is
      // never mounted on the cover), so no page gate: scene + rest state suffice.
      // Legacy gate: fidgets fire only from PLAIN idle (`pose === 'idle'`) — a
      // persist-held arrival pose (fight/spray/think) suppresses them; a wave/
      // sneeze strikePose would otherwise release the held stance.
      const src = s?.rt.activeSource()
      const plainIdle = !!src && (src.kind === 'clip' || src.id === 'stand')
      const idle = !!s && !s.rt.running() && !this.dragging && !this.airborne && plainIdle && performance.now() >= this.stagingUntil
      if (idle && s) {
        const opts = ['hop', 'spin', 'wob', 'wave', 'sneeze', 'chat', 'chat']
        const f = pick('fidget.kind', opts)
        if (f === 'chat') {
          const lines = this.props.chatterLines
          if (lines && lines.length > 0) {
            const line = pick('fidget.line', lines)
            s.rt.runOneShot('__fidget:chat', [{ verb: 'say', text: line }])
          }
        } else if (f === 'wave') {
          s.rt.runOneShot('__fidget:wave', [{ verb: 'strikePose', ref: 'wave', holdMs: 1200 }])
        } else if (f === 'sneeze') {
          this.props.sfx('scrib')
          s.rt.runOneShot('__fidget:sneeze', [
            { verb: 'say', text: 'ah— ah— CHOO!' },
            { verb: 'strikePose', ref: 'sneeze', holdMs: 700 },
          ])
        } else {
          if (f === 'hop') this.props.sfx('hop')
          this.playArc(f as 'hop' | 'spin' | 'wob', true)
        }
      }
      this.scheduleFidget()
    }, scalar('fidget.delayMs', () => 2800 + Math.random() * 3200))
  }

  // ── internals ────────────────────────────────────────────────────────────────
  private arrivalId(pageIdx: number, panelIdx: number): string | null {
    return this.docV2.pages[pageIdx]?.panels[panelIdx]?.arrival?.behaviorId ?? null
  }

  private chainArrival(): void {
    const s = this.scene
    if (!s) return
    const arrivalId = this.pendingArrival
    this.pendingArrival = null
    const doc = arrivalId ? this.docV2.behaviors[arrivalId] : undefined
    if (doc) {
      // when-gates consult the SITE flags (the flag store of record in 9b).
      const gate = (doc as { when?: GateExpr }).when
      if (!gate || evalGate(gate, this.props.flags)) s.rt.runBehavior(doc)
    }
    this.scheduleFlourish()
  }

  /** The legacy arrival FLOURISH (Stage 4): 650ms after settling on a panel with
   * no arrival pose, a 24% roll plays knock / shove / squish (squish only fits
   * short panels). Gated exactly like legacy: authored arrival.flourish wins,
   * else "not the last page"; still-idle checks before playing. */
  private lastFlourish: string | null = null

  private scheduleFlourish(): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const pn = this.docV2.pages[pageIdx]?.panels[this.currentPanel]
    if (!pn) return
    const allow = pn.arrival?.flourish ?? pageIdx !== this.docV2.pages.length - 1
    if (pn.arrival?.hasPose || !allow || !chance('flourish.roll', 0.24)) return
    this.backNavTimers.push(
      window.setTimeout(() => {
        const src = s.rt.activeSource()
        const plainIdle = src.kind === 'clip' || src.id === 'stand'
        if (s.rt.running() || this.dragging || this.airborne || !plainIdle || performance.now() < this.stagingUntil) return
        const opts = ['knock', 'shove']
        if (pn.h < 190) opts.push('squish', 'squish')
        let f = pick('flourish.kind', opts)
        if (f === this.lastFlourish) f = opts[(opts.indexOf(f) + 1) % opts.length]
        this.lastFlourish = f
        if (f === 'squish') {
          this.props.sfx('hop')
          this.bubbleNote = { text: 'snug fit.', until: performance.now() + 1700 }
          this.playSquish()
        } else if (f === 'knock') {
          s.rt.runOneShot('__flourish:knock', [{ verb: 'strikePose', ref: 'knock', holdMs: 1000 }])
          this.backNavTimers.push(window.setTimeout(() => this.props.sfx('fx:jitPage'), 240))
          this.backNavTimers.push(window.setTimeout(() => { this.props.sfx('fx:jitPage'); this.props.sfx('fx:shake') }, 580))
        } else {
          const sdir: 1 | -1 = s.rt.transform.x > 460 ? -1 : 1
          s.rt.transform.facing = sdir
          this.props.sfx('scrape')
          s.rt.runOneShot('__flourish:shove', [{ verb: 'strikePose', ref: 'shove', holdMs: 1450 }])
          this.backNavTimers.push(window.setTimeout(() => this.props.sfx('fx:pageShove'), 120))
        }
      }, 650),
    )
  }

  /** The legacy squish flourish (squishpop on the whole figure). */
  private playSquish(): void {
    const w = this.arcWrap
    const pts = this.figurePoints()
    if (!w || !pts) return
    window.clearTimeout(this.arcTimer)
    w.style.transformBox = 'view-box'
    w.style.transformOrigin = pts.ground
    w.style.animation = 'none'
    void w.getBoundingClientRect()
    w.style.animation = 'squishpop .95s cubic-bezier(.3,.5,.4,1)'
    this.arcTimer = window.setTimeout(() => {
      w.style.animation = ''
    }, 980)
  }

  private panelSpot(pageIdx: number, panelIdx: number): { x: number; y: number } | null {
    const pn = this.docV2.pages[pageIdx]?.panels[panelIdx]
    if (!pn) return null
    return { x: pn.x + pn.anchor.dx, y: pn.y + pn.anchor.dy }
  }

  /** Behaviors whose movement is a jump (can cross gaps/heights ground can't). */
  /** The last travel mode run — the legacy anti-repeat memory. */
  private lastMode: string | null = null

  private pickTravel(pageIdx: number, destIdx: number): BehaviorDoc {
    const s = this.scene!
    // THE LEGACY travel() SELECTION (Stage 3): geometry pools by the trip's shape,
    // the 18% combo gate for big diagonal trips, the authored allow-list filter,
    // weighted custom actions, and the anti-repeat rule — verbatim from
    // Notebook.travel(), with the deterministic rng doing the rolling.
    const to = this.panelSpot(pageIdx, destIdx) ?? { x: s.rt.transform.x, y: s.rt.transform.y }
    const cap = s.rt.capsule()
    const dxv = to.x - s.rt.transform.x
    const dyv = to.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const horiz = Math.abs(dxv)
    const vert = Math.abs(dyv)
    const dist = Math.hypot(dxv, dyv)
    const fallback = this.docV2.behaviors['builtin:hop'] ?? this.docV2.behaviors['builtin:walk']

    // The authored pool (migrated v1 allow-list + weighted actions). Action
    // when-gates evaluate against flags AND the trip geometry (Stage 4: the v1
    // geometric gates — the tightrope only offers itself on long flat trips).
    const geomCtx = { dist, horiz, vert, dyv, fromPanel: this.currentPanel }
    const authored = this.docV2.pages[pageIdx]?.panels[destIdx]?.travel?.pool
    const allowed = new Set<string>()
    const actionEntries: string[] = []
    for (const e of authored ?? []) {
      const doc = this.docV2.behaviors[e.behaviorId]
      if (!doc) continue
      if (e.behaviorId.startsWith('builtin:')) allowed.add(e.behaviorId)
      else {
        const gate = (doc as { when?: GateExpr }).when
        if (gate && !evalGate(gate, this.props.flags, geomCtx)) continue
        const w = Math.max(0, Math.floor(e.weight ?? 1))
        for (let k = 0; k < w; k++) actionEntries.push(e.behaviorId)
      }
    }

    // Combo gate (legacy: big diagonal trips, 18%, never twice in a row).
    const comboOk = (allowed.size === 0 || allowed.has('builtin:combo')) && this.docV2.behaviors['builtin:combo']
    if (dist > 380 && horiz > 240 && vert > 60 && comboOk && this.lastMode !== 'builtin:combo' && chance('travel.combo', 0.18)) {
      reviewLog('engine', 'pick', { key: 'travel.mode', value: 'builtin:combo' })
      this.lastMode = 'builtin:combo'
      return this.docV2.behaviors['builtin:combo']
    }

    // Geometry pools — the legacy shape → verb mapping, weights via repetition.
    let modes: string[]
    if (vert > 110) modes = dyv < 0 ? ['wallrun', 'wallrun', 'swing', 'hop', 'poof'] : ['slide', 'slide', 'swing', 'hop', 'roll']
    else if (horiz > 430) modes = ['swing', 'rope', 'rope', 'vault', 'poof']
    else if (horiz > 250) modes = ['vault', 'vault', 'rope', 'swing', 'walk', 'smash']
    else modes = ['walk', 'vault', 'hop', 'roll', 'smash', 'walk']
    let entries = modes.map((m) => `builtin:${m}`).filter((id) => this.docV2.behaviors[id])
    if (allowed.size > 0) {
      const filtered = entries.filter((id) => allowed.has(id))
      if (filtered.length > 0) entries = filtered // an author error never empties the pool
    }
    entries = [...entries, ...actionEntries]
    if (entries.length === 0) return fallback

    let id = this.forcedTravel(entries) ?? entries[s.ctx.rng.int(0, entries.length)]
    if (id === this.lastMode) id = entries[(entries.indexOf(id) + 1) % entries.length] // anti-repeat
    reviewLog('engine', 'pick', { key: 'travel.mode', value: id })
    this.lastMode = id
    return this.applyVariant(this.docV2.behaviors[id] ?? fallback)
  }

  /** Variant docs are adapter-rolled AFTER the pool pick (never pool members —
   * the geometry pools enumerate base modes only): the legacy in-routine dice,
   * all review-forceable. */
  private applyVariant(doc: BehaviorDoc): BehaviorDoc {
    if (doc.id === 'builtin:vault' && this.docV2.behaviors['builtin:vault-peek'] && chance('vault.peek', 0.3)) {
      return this.docV2.behaviors['builtin:vault-peek']
    }
    return doc
  }

  /** Review-only travel forcing: 'travel.mode' may name a bare mode ('vault') or a
   * full behavior id ('builtin:vault' / 'act:tightrope'). Returns null unforced or
   * when the forced id isn't in the candidate list (the real pool still governs). */
  private forcedTravel(candidates: readonly string[]): string | null {
    const f = reviewHook()?.force?.['travel.mode']
    if (f === undefined) return null
    const want = String(f)
    return candidates.find((id) => id === want || id === `builtin:${want}` || id === `act:${want}`) ?? null
  }

  private makeBubble(svg: SVGSVGElement): void {
    const NS = 'http://www.w3.org/2000/svg'
    const g = document.createElementNS(NS, 'g') as SVGGElement
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('rx', '8')
    rect.setAttribute('fill', '#fffdf6')
    rect.setAttribute('stroke', '#1a1a1a')
    rect.setAttribute('stroke-width', '2.5')
    const text = document.createElementNS(NS, 'text')
    text.setAttribute('font-size', '15')
    text.setAttribute('font-weight', '700')
    text.setAttribute('font-family', "'Patrick Hand', 'Comic Sans MS', cursive")
    g.appendChild(rect)
    g.appendChild(text)
    g.style.display = 'none'
    svg.appendChild(g)
    this.bubble = g
  }

  private drawBubble(): void {
    const s = this.scene
    const b = this.bubble
    if (!s || !b) return
    let sp = s.rt.speech()
    // Adapter quips (trip 'whoa—', hang 'hup—') fill in when the engine bubble
    // is silent; a real behavior say always wins.
    if (!sp && this.bubbleNote) {
      if (performance.now() < this.bubbleNote.until) sp = { text: this.bubbleNote.text, remainingMs: 1 }
      else this.bubbleNote = null
    }
    if (!sp) {
      b.style.display = 'none'
      return
    }
    const head = s.rt.solved().bones.find((bn) => bn.id === 'head')
    if (!head) return
    const tx = head.ex + 18
    const ty = head.ey - 40
    const text = b.children[1] as SVGTextElement
    text.textContent = sp.text
    text.setAttribute('x', String(tx + 10))
    text.setAttribute('y', String(ty + 19))
    const rect = b.children[0] as SVGRectElement
    rect.setAttribute('x', String(tx))
    rect.setAttribute('y', String(ty))
    rect.setAttribute('width', String(sp.text.length * 8.2 + 20))
    rect.setAttribute('height', '28')
    b.style.display = ''
  }

  render(): ReactNode {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 55, pointerEvents: 'none' }}>
        <svg
          ref={this.svgRef}
          viewBox="0 0 920 660"
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        />
        <div
          ref={(r) => { this.pokeBox = r }}
          data-dash-poke
          onMouseDown={(e) => { e.preventDefault(); this.beginDrag(e) }}
          onClick={() => {
            if (this.dragMoved) { this.dragMoved = false; return } // a drag, not a poke
            this.props.onPoke?.()
            this.poke()
          }}
          style={{ position: 'absolute', left: 0, top: 0, width: 92, height: 130, pointerEvents: 'auto', cursor: 'grab' }}
        />
      </div>
    )
  }
}
