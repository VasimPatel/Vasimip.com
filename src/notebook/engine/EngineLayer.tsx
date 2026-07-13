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
  sweptCapsuleVsSegments,
  STEP_MS,
  type CharacterRuntime,
  type EngineContext,
  type MutableWorld,
  type VerletWorld,
} from '../../../packages/engine/src/index'
import { evalGate, type BehaviorDoc, type GateExpr } from '../../../packages/schema/src/index'
import { createCharacterRenderer, type CharacterRenderer } from '../../../packages/renderer-svg/src/index'
import { engineSkins, type EngineDoc } from './engineDoc'
import { pick, scalar, reviewHook, reviewLog } from '../review'

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
  /** Camera follow: Dash's live position while traveling; null = travel done
   * (the Notebook returns the camera to panel focus). */
  onDashCam?(p: { x: number; y: number } | null): void
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
        s.ctx.clock.advance()
        s.rt.tick()
        s.verlet.step()
        s.mw.stepMutations()
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
      this.renderer.render(solved, s.rt.face(), s.rt.overrides(), {
        flourish: s.rt.flourish(),
        spin: this.rolling && this.airborne ? this.spin : 0,
        accessories: s.rt.accessories.map((a) => a.points()),
        pupilScale: 1 + 0.55 * near, // legacy eyeR 2 → 3.1 at the cursor
        lean: this.lean,
        props: (activePose as { props?: never[] } | undefined)?.props,
        skinId: src.id,
        skinRoot: { x: s.rt.transform.x, y: Math.max(cap.y0, cap.y1) + cap.r },
        facing: s.rt.transform.facing as 1 | -1,
      })

      // Camera follows Dash while a travel is in flight (throttled ~9 ticks; the
      // Notebook's CSS cam transition glides between updates).
      if (this.travelDest != null && ++this.camTick % 9 === 0) {
        this.props.onDashCam?.({ x: s.rt.transform.x, y: s.rt.transform.y })
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
    const spot = this.panelSpot(pageIdx, 0) ?? { x: 120, y: 300 }
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
      ctx.events.on('intent:sfx', (p) => this.props.sfx((p as { kind: string }).kind)),
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
        this.props.onDashCam?.(null)
        this.chainArrival()
      }),
      ctx.events.on('behavior:ended', () => this.recoverOrArrive()),
      ctx.events.on('behavior:halted', () => this.recoverOrArrive()),
    ]

    this.scene = { ctx, verlet, mw, rt, pageIdx, offs }
    this.currentPanel = 0
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

    // Entrance: the legacy Dash STROLLS IN from the panel's left edge before the
    // arrival plays (enterPage ran him in from offscreen at 1.25s). Engine-native:
    // spawn at the left end of panel 0's support line, walk to the anchor. Short
    // lines (< 60 px of walk) skip the stroll — a two-step shuffle reads as jitter.
    this.pendingArrival = this.arrivalId(pageIdx, 0)
    const pn0 = this.docV2.pages[pageIdx]?.panels[0]
    const walkDoc = this.docV2.behaviors['builtin:walk']
    const entryDist = pn0 ? spot.x - (pn0.x + 10) : 0
    if (pn0 && walkDoc && entryDist >= 60) {
      rt.transform.x = pn0.x + 10
      rt.transform.facing = 1
      this.travelDest = 0
      this.props.sfx('scrib')
      rt.runBehavior(walkDoc, { travel: { from: `panel:${pageIdx}:0`, to: `panel:${pageIdx}:0` } })
      return
    }
    this.chainArrival()
  }

  /** The Notebook's nav: Dash travels to panel j on the current page. */
  travelTo(panelIdx: number): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const fromId = `panel:${pageIdx}:${this.currentPanel}`
    const toId = `panel:${pageIdx}:${panelIdx}`
    const doc = this.pickTravel(pageIdx, panelIdx)
    this.pendingArrival = this.arrivalId(pageIdx, panelIdx)
    this.currentPanel = panelIdx
    this.clearTravel()
    this.travelDest = panelIdx
    this.rolling = doc.id === 'builtin:roll' || doc.id === 'builtin:hop' || doc.id === 'builtin:combo'
    this.spin = 0
    this.props.onHeading?.(panelIdx)
    s.rt.runBehavior(doc, { travel: { from: fromId, to: toId } })
  }

  /** A travel run blocked/failed → the legacy escape hatch: POOF. Smoke, teleport
   * to the destination spot (driver-owned placement, like enterPage), arrival. */
  private recoverOrArrive(): void {
    const s = this.scene
    if (!s) return
    const dest = this.travelDest
    this.travelDest = null
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

  /** Back-nav spectacle (legacy bombBack/poofBack): play a quick beat, then
   * `done()` (the Notebook flips the page). Never wedges: done is also called on
   * ended/halted, and a 1.4s timer is the belt-and-braces. */
  backNav(kind: 'bomb' | 'poof', done: () => void): void {
    const s = this.scene
    if (!s) {
      done()
      return
    }
    this.cancelBackNav() // supersession: a new back-nav cancels the previous
    this.clearArc()
    let called = false
    const fire = (): void => {
      if (called) return
      called = true
      offA()
      offB()
      this.backNavCancel = null
      done()
    }
    const offA = s.ctx.events.on('behavior:complete', fire)
    const offB = s.ctx.events.on('behavior:ended', fire)
    const timer = window.setTimeout(fire, 1400)
    this.backNavCancel = () => {
      called = true
      offA()
      offB()
      window.clearTimeout(timer)
      this.backNavCancel = null
    }
    if (kind === 'bomb') {
      s.rt.runOneShot('__backnav:bomb', [
        { verb: 'strikePose', ref: 'throw', holdMs: 380 },
        { verb: 'sfx', kind: 'boom' },
      ])
    } else {
      s.rt.runOneShot('__backnav:poof', [
        { verb: 'sfx', kind: 'fx:smoke' },
        { verb: 'strikePose', ref: 'sneeze', holdMs: 240 },
        { verb: 'sfx', kind: 'poof' },
      ])
    }
  }

  /** Dev-hook surface (admin Test buttons + harness): run a specific behavior id
   * toward the farthest panel, exactly like the legacy hooks did. */
  testBehavior(behaviorId: string): boolean {
    const s = this.scene
    const doc = this.docV2.behaviors[behaviorId]
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
    const fromId = `panel:${pageIdx}:${this.currentPanel}`
    const toId = `panel:${pageIdx}:${far}`
    this.clearTravel()
    this.travelDest = far
    this.rolling = doc.id === 'builtin:roll' || doc.id === 'builtin:hop' || doc.id === 'builtin:combo'
    this.pendingArrival = this.arrivalId(pageIdx, far)
    this.currentPanel = far
    s.rt.runBehavior(doc, { travel: { from: fromId, to: toId } })
    return true
  }

  busy(): boolean {
    return this.scene?.rt.running() ?? false
  }

  poke(): void {
    const s = this.scene
    if (!s) return
    s.ctx.events.emit('expression:poke', { characterId: this.dash.id })
    s.verlet.applyImpulse(`secondary:${this.dash.id}`, 70, -140)
    for (const a of s.rt.accessories) s.verlet.applyImpulse(a.bodyId, 120, -100)
    // The legacy reaction: a random whole-figure arc + a quip — only when he's
    // actually standing around (legacy gated pokes on `standing`).
    if (!s.rt.running() && !this.dragging && !this.airborne) {
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
    if (!s || this.dragging) return
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
  }

  /** Centralized travel/flight teardown: camera released, spin/roll cleared,
   * any in-flight fidget/poke arc stopped (review: a wrapper animation kept
   * rotating about its OLD world origin while Dash flew elsewhere). */
  private clearTravel(): void {
    this.travelDest = null
    this.pendingArrival = null
    this.rolling = false
    this.airborne = false
    this.spin = 0
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
   * running behavior means no fidget/poke arc can race it. */
  private static POSE_ACTS: Record<string, string> = {
    fight: 'fightshift 2.6s ease-in-out infinite',
  }

  private actPose: string | null = null

  private syncPoseAct(poseId: string | null): void {
    const anim = poseId ? EngineLayer.POSE_ACTS[poseId] : undefined
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
    // Settle to the nearest support below. forceRelease() early-returns when no
    // behavior is running (the grab already released it), so the layer probes
    // for itself; a drop into the void poofs home to the current panel.
    const cap = s.rt.capsule()
    const PROBE = 2200
    const hit = sweptCapsuleVsSegments(cap, 0, PROBE, s.mw.collision().segments)
    if (hit) {
      s.rt.transform.y += hit.t * PROBE - 0.5
    } else {
      const spot = this.panelSpot(s.pageIdx, this.currentPanel)
      if (spot) {
        this.props.sfx('fx:smoke')
        s.rt.transform.x = spot.x
        const c2 = s.rt.capsule()
        s.rt.transform.y += spot.y - (c2.y1 + c2.r)
      }
    }
    s.ctx.events.emit('jump:land', { characterId: this.dash.id }) // squash flourish
    this.props.sfx('thud')
    const lines = this.props.dropLines
    if (this.dragMoved && lines && lines.length > 0 && s.ctx.rng.float() < 0.6) {
      const line = lines[s.ctx.rng.int(0, lines.length)]
      s.rt.runOneShot('__drop:quip', [{ verb: 'say', text: line }])
    }
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
  private playArc(kind: 'hop' | 'spin' | 'wob', fidget: boolean): void {
    const w = this.arcWrap
    const pts = this.figurePoints()
    if (!w || !pts) return
    const spec =
      kind === 'spin'
        ? { origin: pts.mid, anim: `spin360 ${fidget ? '.6s' : '.55s'} cubic-bezier(.5,.1,.4,1)`, ms: fidget ? 650 : 600 }
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
      const idle = !!s && !s.rt.running() && !this.dragging && !this.airborne
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
    if (!s || !this.pendingArrival) return
    const doc = this.docV2.behaviors[this.pendingArrival]
    this.pendingArrival = null
    if (!doc) return
    // when-gates consult the SITE flags (the flag store of record in 9b).
    const gate = (doc as { when?: GateExpr }).when
    if (gate && !evalGate(gate, this.props.flags)) return
    s.rt.runBehavior(doc)
  }

  private panelSpot(pageIdx: number, panelIdx: number): { x: number; y: number } | null {
    const pn = this.docV2.pages[pageIdx]?.panels[panelIdx]
    if (!pn) return null
    return { x: pn.x + pn.anchor.dx, y: pn.y + pn.anchor.dy }
  }

  /** Behaviors whose movement is a jump (can cross gaps/heights ground can't). */
  private static JUMPY = new Set(['builtin:hop', 'builtin:roll', 'builtin:vault', 'builtin:swing', 'builtin:smash', 'builtin:poof', 'builtin:combo'])

  private pickTravel(pageIdx: number, destIdx: number): BehaviorDoc {
    const s = this.scene!
    // Geometry heuristics (the legacy travel() logic, which lived in CODE and was
    // not migratable data): a trip with real height/width needs a jump-capable
    // behavior; a flat stroll can use anything.
    const from = this.panelSpot(pageIdx, this.currentPanel)
    const to = this.panelSpot(pageIdx, destIdx)
    const needsAir = !!from && !!to && (Math.abs(to.y - from.y) > 24 || Math.abs(to.x - from.x) > 200)
    // v1 semantics: the DESTINATION panel's (merged) pool governs the trip.
    let pool = this.docV2.pages[pageIdx]?.panels[destIdx]?.travel?.pool
    const fallback = this.docV2.behaviors['builtin:hop'] ?? this.docV2.behaviors['builtin:walk']
    if (pool && needsAir) {
      const airy = pool.filter((e) => EngineLayer.JUMPY.has(e.behaviorId))
      if (airy.length > 0) pool = airy
    }
    if (!pool || pool.length === 0) {
      // No authored pool → the classic default: the full builtin set (air-filtered).
      let ids = Object.keys(this.docV2.behaviors).filter((id) => id.startsWith('builtin:'))
      if (needsAir) ids = ids.filter((id) => EngineLayer.JUMPY.has(id))
      const id = this.forcedTravel(ids) ?? ids[s.ctx.rng.int(0, ids.length)]
      reviewLog('engine', 'pick', { key: 'travel.mode', value: id })
      return this.docV2.behaviors[id] ?? fallback
    }
    const entries: string[] = []
    for (const e of pool) {
      const doc = this.docV2.behaviors[e.behaviorId]
      if (!doc) continue
      const gate = (doc as { when?: GateExpr }).when
      if (gate && !evalGate(gate, this.props.flags)) continue
      const w = Math.max(1, Math.floor(e.weight ?? 1))
      for (let k = 0; k < w; k++) entries.push(e.behaviorId)
    }
    if (entries.length === 0) return fallback
    const id = this.forcedTravel(entries) ?? entries[s.ctx.rng.int(0, entries.length)]
    reviewLog('engine', 'pick', { key: 'travel.mode', value: id })
    return this.docV2.behaviors[id] ?? fallback
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
    const sp = s.rt.speech()
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
