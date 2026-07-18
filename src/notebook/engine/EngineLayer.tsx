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
import { STAGE_W, STAGE_H } from '../doc/spread'
import { battleBus, DASH_LUNGE_CONTACT_MS, FOE_ATTACK_CONTACT_MS, FOE_SIDE, KICK_CLEAR_MS, KICK_CONTACT_MS } from '../battleBus'

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
  /** Engine speech (Q6): published to the shell, which renders the SHARED
   * legacy ReactBubble (yellow marker bubble + pop-in) — the engine never
   * draws a lookalike. Page coordinates; null clears. */
  onSpeech?(s: { text: string; x: number; y: number } | null): void
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
  /** Airborne-roll state (render-layer charm). */
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
  /** Battle exchange timer (the ABOUT sword fight): while Dash holds the fight
   * stance, scheduleBattle directs one exchange per tick and cues the
   * FightScene duelist over battleBus. */
  private battleTimer = 0
  /** Smoothed cursor-lean (rad) — the legacy .22s ease-out transition. */
  private lean = 0
  /** Scripted root motion (back-nav hop-to-hole) — render-layer, like drag.
   * `ease` shapes k (surf ride/drop use the legacy flipTo easings); default linear. */
  private scriptMove: {
    fromX: number
    fromY: number
    toX: number
    toY: number
    t0: number
    dur: number
    arcH: number
    ease?: (k: number) => number
  } | null = null
  /** Actor visibility (back-nav dive/poof vanish). */
  private actorHidden = false
  private actorHiddenApplied = false
  /** The NEXT enterPage's staging (back-nav landings replace the entrance stroll). */
  private pendingEntrance: { kind: 'bombPop' | 'poofIn' | 'surfIn'; panel: number; fromX?: number; fromY?: number } | null = null

  /** The next forward flip rides in surfing (legacy 38% page-surf variant).
   * Captures the CURRENT position — the ride glides from it to the new anchor. */
  surfNext(): void {
    const t = this.scene?.rt.transform
    this.pendingEntrance = { kind: 'surfIn', panel: 0, fromX: t?.x, fromY: t?.y }
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
  /** Staged crossing for the running travel (parity 3b — "fix the actions"): the
   * engine runs the REAL approach leg (and beats like the smash punches); the
   * legacy crossing choreography stages at behavior:complete, like pendingHang.
   * Why staged: legacy crossings are fixed-tempo tweens over ANY geometry — the
   * wall climb and rope bar aren't engine modes (owner deferred climb), ballistic
   * jump arcs can clip panel walls (no arc-clearance in the planner yet), and
   * far/high pairs have no ground route at all. */
  private pendingStage: { kind: 'wallrun' | 'vault' | 'rope' | 'slide' | 'smash'; dest: number } | null = null
  /** The running travel's behavior id — recovery picks its shape by verb (a
   * failed hop/roll re-plays the legacy hop ARC; everything else poofs). */
  private travelKind: string | null = null
  /** Approach-only copies of staged-crossing docs, keyed by the SOURCE doc id.
   * Cached so re-runs pass the registry's reference-stability contract; the
   * copy carries its own '#approach' id — the full doc is already registered. */
  private approachDocs = new Map<string, BehaviorDoc>()
  /** Adapter speech (trip 'whoa—', hang 'hup—') — shown when the engine bubble
   * is otherwise silent; a real say wins. */
  private bubbleNote: { text: string; until: number } | null = null

  private cancelBackNav(): void {
    this.backNavCancel?.()
  }

  componentDidMount(): void {
    this.busDetach = battleBus.attachDirector()
    this.enterPage(this.props.page)
    this.last = performance.now()
    const frame = (now: number): void => {
      this.raf = requestAnimationFrame(frame)
      this.acc += Math.min(120, now - this.last)
      this.last = now
      const s = this.scene
      if (!s || !this.renderer) return
      // Scripted root motion (back-nav hop-to-hole) and the drag follow run
      // BEFORE the sim steps (review: mutating after the snapshot made their
      // interpolation cadence-dependent) — they are wall-clock continuous and
      // the snapshots taken below now include them coherently.
      if (this.scriptMove) {
        const m = this.scriptMove
        const kRaw = Math.min(1, (performance.now() - m.t0) / m.dur)
        const k = m.ease ? m.ease(kRaw) : kRaw
        const t = s.rt.transform
        t.x = m.fromX + (m.toX - m.fromX) * k
        t.y = m.fromY + (m.toY - m.fromY) * k - m.arcH * 4 * k * (1 - k)
        if (kRaw >= 1) this.scriptMove = null
      }
      if (this.dragging && this.dragMoved && this.look) {
        const t = s.rt.transform
        const ease = 0.45
        t.x = t.x + (this.look.x - t.x) * ease
        t.y = t.y + (this.look.y - 24 - t.y) * ease
      }
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
        else this.capeLag = 0 // teleport: momentum must not survive (review)
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
      if (this.ropeFx) this.renderRope(skinRoot)
      if (reviewHook()?.motion) this.recordMotion(s, solved, skinRoot, src.id)

      if (this.actorHidden !== this.actorHiddenApplied && this.svgRef.current) {
        this.svgRef.current.style.opacity = this.actorHidden ? '0' : '1'
        this.actorHiddenApplied = this.actorHidden
      }
      this.publishSpeech(skinRoot)
      // Poke hitbox tracks the figure (the wrapper must NOT catch page-wide
      // clicks — review finding: it swallowed the cover's open handler).
      if (this.pokeBox) {
        const t = s.rt.transform
        this.pokeBox.style.transform = `translate(${t.x - 46}px, ${t.y - 78}px)`
      }
    }
    this.raf = requestAnimationFrame(frame)
    this.scheduleFidget()
    this.scheduleBattle()
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
    // The VISIBLE cape (review blocker: the metric sampled the hidden ribbon):
    // for authored skin capes, capeRoot = the RENDERED knot via the live CTM and
    // sock = the EXPECTED world socket from the placement math — an independent
    // DOM measurement that catches real render defects.
    const probe = this.renderer?.capeProbe() ?? null
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
      sockX: (probe ? probe.x : (neck?.ex ?? NaN)) + sockBias,
      sockY: probe ? probe.y : (neck?.ey ?? NaN),
      capeRootX: probe ? this.expectedCapeSocket(skinRoot, srcId)?.x ?? NaN : (pts[0]?.x ?? NaN),
      capeRootY: probe ? this.expectedCapeSocket(skinRoot, srcId)?.y ?? NaN : (pts[0]?.y ?? NaN),
      capeTipX: tip?.x ?? NaN,
      capeTipY: tip?.y ?? NaN,
      camX: this.lastCam?.x ?? NaN,
      camY: this.lastCam?.y ?? NaN,
      scrX: rect ? rect.x + rect.width / 2 : NaN,
      scrY: rect ? rect.y + rect.height / 2 : NaN,
    }
    arr.push(sample)
  }

  /** Where the authored cape knot SHOULD be in page coords (the same placement
   * math the renderer applies): skinRoot + scale(104/120·facing, 113/130) about
   * the (0,55) foot origin. Static-transform cape wrappers (slide/vault) shift
   * the knot too — this expectation intentionally ignores them, so the CTM
   * probe comparison measures ONLY unexpected displacement for plain capes and
   * those poses are excluded from the ≤2px assertion (documented). */
  private expectedCapeSocket(skinRoot: { x: number; y: number }, srcId: string): { x: number; y: number } | null {
    const doc = engineSkins.docs.find((d) => d.sources.includes(srcId))
    if (!doc?.cape) return null
    const s = this.scene
    if (!s) return null
    const facing = s.rt.transform.facing
    return {
      x: skinRoot.x + (104 / 120) * facing * doc.cape.socket.x,
      y: skinRoot.y + (113 / 130) * (doc.cape.socket.y - 55),
    }
  }

  componentDidUpdate(prev: EngineLayerProps): void {
    // Doc hot-swap (server fetch / admin preview) rebuilds the scene on the SAME
    // page; page changes rebuild for the new page.
    if (prev.doc !== this.props.doc || prev.page !== this.props.page) this.enterPage(this.props.page)
  }

  componentWillUnmount(): void {
    cancelAnimationFrame(this.raf)
    window.clearTimeout(this.fidgetTimer)
    window.clearTimeout(this.battleTimer)
    this.busDetach?.()
    this.busDetach = null
    this.teardown()
  }

  /** battleBus director registration (undirected scenes ignore stale state). */
  private busDetach: (() => void) | null = null

  private teardown(): void {
    if (this.onDragUp) window.removeEventListener('pointerup', this.onDragUp)
    if (this.onDragBlur) {
      window.removeEventListener('pointercancel', this.onDragBlur)
      window.removeEventListener('blur', this.onDragBlur)
    }
    this.onDragUp = null
    this.onDragBlur = null
    this.dragging = false
    this.cancelBackNav()
    // Back-nav landing timers belong to the OLD scene — a navigation during the
    // pop-in/reappear staging must not fire them against the new runtime.
    for (const t of this.backNavTimers) window.clearTimeout(t)
    this.backNavTimers = []
    this.scriptMove = null
    this.approachDocs.clear() // an admin doc-swap must not serve stale approach copies
    this.actorHidden = false
    this.actorHiddenApplied = false
    this.stagingUntil = 0
    this.prevSnap = null
    this.curSnap = null
    this.capeLag = 0
    this.bubbleNote = null
    if (this.svgRef.current) this.svgRef.current.style.opacity = '1'
    this.clearRope() // the svg is being rebuilt — no fade, just remove
    this.clearTravel()
    for (const off of this.scene?.offs ?? []) off()
    this.scene?.rt.dispose()
    this.renderer?.destroy()
    this.renderer = null
    window.clearTimeout(this.arcTimer)
    this.arcWrap?.remove()
    this.arcWrap = null
    this.lean = 0
    if (this.lastSpeech) {
      this.lastSpeech = null
      this.props.onSpeech?.(null)
    }
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
          this.lastCam = null
          this.props.onDashCam?.(null)
          return
        }
        const pt = this.resolveCamTarget(c.to)
        if (!pt) return
        const inFlight = this.travelDest != null
        const cx = inFlight ? (rt.transform.x + pt.x) / 2 : pt.x
        const cy = inFlight ? pt.y - 26 : pt.y - 40
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
        if (this.pendingStage) {
          const st = this.pendingStage
          this.pendingStage = null
          // each staging owns the camera and ends with chainArrival
          if (st.kind === 'wallrun') this.wallrunStaging(st.dest)
          else if (st.kind === 'vault') this.vaultStaging(st.dest)
          else if (st.kind === 'rope') this.ropeStaging(st.dest)
          else if (st.kind === 'slide') this.slideStaging(st.dest)
          else this.smashStaging(st.dest)
          return
        }
        this.lastCam = null
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
      // Legacy page-surf (the owner's "flying page to page"): Dash RIDES the flip.
      // The Notebook keeps this layer VISIBLE through a surf flip (surfFlip), so
      // the whole legacy timeline plays on screen, beats from the flip start:
      // glide in surf art from the OLD page's position to a hover 96px above the
      // new anchor (0–780ms, over the turning page), tuck-drop at 880 (340ms),
      // squash-land at 1240, arrival pose at 1780 — flipTo's exact choreography.
      this.stagingUntil = performance.now() + 1800
      const t = rt.transform
      // t.y is the grounded ROOT Y at the anchor (feet on spot.y — set above);
      // the whole timeline runs in root space (codex: landing at spot.y put the
      // ROOT on the foot line, a torso-length low).
      const groundY = t.y
      const fromX = pe.fromX ?? spot.x - 240
      const fromY = pe.fromY ?? groundY - 96
      t.x = fromX
      t.y = fromY
      t.facing = 1
      rt.act('surf', { holdMs: 'persist' })
      // legacy flipTo easings: ride cubic-bezier(.5,.08,.28,1), drop (.55,.05,.6,1)
      // — both read as smoothstep at this scale.
      const smooth = (k: number): number => k * k * (3 - 2 * k)
      this.scriptMove = { fromX, fromY, toX: spot.x, toY: groundY - 96, t0: performance.now(), dur: 780, arcH: 0, ease: smooth }
      const at = (ms: number, fn: () => void): void => {
        this.backNavTimers.push(window.setTimeout(fn, ms))
      }
      at(880, () => {
        this.props.sfx('hop')
        rt.act('jump-tuck', { holdMs: 400 })
        this.scriptMove = { fromX: spot.x, fromY: groundY - 96, toX: spot.x, toY: groundY, t0: performance.now(), dur: 340, arcH: 0, ease: smooth }
      })
      at(1240, () => {
        rt.clearAct()
        rt.runOneShot('__surf:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 300 }])
        this.props.sfx('fx:shake')
      })
      at(1780, () => this.chainArrival())
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

  /** The Notebook's nav: Dash travels to panel j on the current page. Leaving
   * the battle (either direction) kicks the duelist off the page first. */
  travelTo(panelIdx: number): void {
    const s = this.scene
    if (!s) return
    const kickMs = this.maybeKickFoe()
    if (kickMs > 0) {
      this.backNavTimers.push(
        window.setTimeout(() => {
          const s2 = this.scene
          if (!s2 || this.dragging) return
          this.startTravel(this.pickTravel(s2.pageIdx, panelIdx), panelIdx)
        }, kickMs),
      )
      return
    }
    this.startTravel(this.pickTravel(s.pageIdx, panelIdx), panelIdx)
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
    // SWING is code choreography too (legacy swingTo): the bar hangs above the
    // destination panel's near top corner — not a standable node, so no engine
    // route reaches it. Hop to the bar, hang & swing, release into a sag arc.
    if (doc.id === 'builtin:swing') {
      this.swingTravel(panelIdx)
      return
    }
    // clearTravel FIRST — it nulls pendingArrival AND pendingStage (review
    // BLOCKER class: the old order set the arrival and then wiped it, so travel
    // arrivals never played — the same trap bit pendingStage on first cut).
    this.clearTravel()
    // Staged-crossing travels: the doc is the approach (+ in-place beats); the
    // legacy crossing choreography attaches at behavior:complete.
    const stageKind = EngineLayer.STAGED_CROSSINGS[doc.id]
    this.pendingStage = stageKind ? { kind: stageKind, dest: panelIdx } : null
    this.travelKind = doc.id
    // Staged verbs run an APPROACH-ONLY copy: the content doc keeps its full
    // crossing so HEADLESS consumers still travel truthfully (codex P2); the
    // cut falls at the first step referencing the DESTINATION (travel:to…),
    // where the adapter's legacy crossing choreography takes over.
    let runDoc = doc
    if (stageKind) {
      const cached = this.approachDocs.get(doc.id)
      if (cached) {
        runDoc = cached
      } else {
        const cut = doc.steps.findIndex((st) => {
          const ref = (st as { target?: unknown }).target ?? (st as { to?: unknown }).to
          return typeof ref === 'string' && ref.startsWith('travel:to')
        })
        if (cut >= 0) {
          runDoc = { ...doc, id: `${doc.id}#approach`, steps: doc.steps.slice(0, cut) }
          this.approachDocs.set(doc.id, runDoc)
        }
      }
    }
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

    // Q5 — AUTHORED camera: one establishing shot per travel framing departure
    // AND destination before root motion begins (the comic-panel staging the
    // review recommends — Dash stays visible without a follow chase). Cue shots
    // (vault 1.15× etc.) override mid-flight; completion releases to the
    // destination panel focus. Short in-panel trips skip the shot entirely.
    if (from && to) {
      const span = Math.abs(to.x - from.x)
      if (span >= 200 && pn) {
        const mult = Math.max(0.55, Math.min(1, (pn.w + 60) / (span + 140)))
        this.lastCam = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 26 }
        this.props.onDashCam?.({ ...this.lastCam, mult, fast: true })
      }
    }

    // Q4 — the legacy ordinary-walk timing policy: duration = clamp(dist/190,
    // 0.7s, 2.2s), expressed as a per-run default ground speed (authored step
    // speeds always win, so approaches/crossings keep their legacy classes).
    let defaultSpeed: number | undefined
    if (doc.id === 'builtin:walk' && from && to) {
      const dist = Math.hypot(to.x - from.x, to.y - from.y)
      if (dist > 1) defaultSpeed = dist / Math.min(2.2, Math.max(0.7, dist / 190))
    }

    s.rt.runBehavior(runDoc, { travel: { from: fromId, to: toId }, defaultSpeed })
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

  /** Travels whose crossing beat is adapter choreography (see pendingStage). */
  private static STAGED_CROSSINGS: Record<string, 'wallrun' | 'vault' | 'rope' | 'slide' | 'smash'> = {
    'builtin:wallrun': 'wallrun',
    'builtin:vault': 'vault',
    'builtin:vault-peek': 'vault',
    'builtin:rope': 'rope',
    // the owner's tightrope action crosses on the SAME grappled line (its cut
    // falls after the scrib, so Dash grapples from where he stands)
    'act:tightrope': 'rope',
    'builtin:slide': 'slide',
    'builtin:smash': 'smash',
  }

  /** Legacy swingTo: the bar hangs above the destination panel's NEAR top corner
   * — not a standable node, so this is code choreography end-to-end (like poof).
   * Beats from legacy: windup pause, tuck hop to the bar (180–780), hang in the
   * swing art with the bar-framed camera (800–1440), release into a SAG arc to
   * the anchor (1440–1940, the pendulum dip), squash-land 1980, arrival 2520. */
  private swingTravel(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const B = this.docV2.pages[pageIdx]?.panels[destIdx]
    const spot = this.panelSpot(pageIdx, destIdx)
    if (!B || !spot) {
      this.poofTravel(destIdx) // no bar geometry → the legacy escape hatch
      return
    }
    this.clearTravel() // FIRST — it nulls pendingArrival (same review blocker)
    this.travelFrom = this.currentPanel
    this.pendingArrival = this.arrivalId(pageIdx, destIdx)
    this.currentPanel = destIdx
    this.travelDest = null
    this.stagingUntil = performance.now() + 2560
    this.props.onHeading?.(destIdx)
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r) // root offset above the feet
    const dir: 1 | -1 = spot.x >= t.x ? 1 : -1
    const barX = dir === 1 ? B.x + 34 : B.x + B.w - 34 // legacy barDx+52
    const barRootY = B.y + 101 + rootDy // legacy dy=B.y−12, feet at +113 → B.y+101
    const fromX = t.x
    const fromY = t.y
    t.facing = dir
    const smooth = (k: number): number => k * k * (3 - 2 * k)
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    at(180, () => {
      this.props.sfx('hop')
      s.rt.act('jump-tuck', { holdMs: 'persist' })
      this.scriptMove = { fromX, fromY, toX: barX, toY: barRootY, t0: performance.now(), dur: 600, arcH: 34, ease: smooth }
    })
    at(800, () => {
      this.props.sfx('whoosh')
      s.rt.act('swing', { holdMs: 'persist' })
      this.lastCam = { x: barX, y: B.y + 58 }
      this.props.onDashCam?.({ x: barX, y: B.y + 58, mult: 1.2, fast: true })
    })
    at(1440, () => {
      this.props.sfx('whoosh')
      t.facing = spot.x >= barX ? 1 : -1
      s.rt.act('jump-tuck', { holdMs: 'persist' })
      // negative arc = the pendulum SAG (legacy top ease dips below the line)
      this.scriptMove = { fromX: barX, fromY: barRootY, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur: 500, arcH: -44, ease: smooth }
    })
    at(1980, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__swing:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 300 }])
      this.props.sfx('hop')
      this.props.sfx('fx:shake')
    })
    at(2520, () => {
      this.lastCam = null
      this.props.onDashCam?.(null)
      this.chainArrival()
    })
  }

  /** Legacy wallrunTo's back half — runs at the wallrun approach's completion
   * (pendingStage), with Dash grounded at his own panel's edge: tuck-hop to
   * the destination's near WALL BASE, run UP the wall in the wallrun art
   * (legacy 330px/s to 70px above the panel top), tuck onto the anchor, land.
   * The climb is scripted — there is no engine climb mode yet (owner-deferred). */
  private wallrunStaging(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const B = this.docV2.pages[pageIdx]?.panels[destIdx]
    const spot = this.panelSpot(pageIdx, destIdx)
    if (!B || !spot) {
      this.chainArrival()
      return
    }
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const sideX = t.x < B.x + B.w / 2 ? B.x : B.x + B.w
    const wdir: 1 | -1 = t.x <= sideX ? 1 : -1
    const crossDur = Math.min(600, Math.max(240, (Math.abs(sideX - t.x) / 290) * 1000))
    const climbTopY = B.y + 43 + rootDy // legacy midDy=B.y−70, feet at B.y+43 (mid-wall)
    const climbDur = Math.max(450, (Math.abs(climbTopY - t.y) / 330) * 1000)
    const fromX = t.x
    const fromY = t.y
    const tHop = crossDur + 60 + climbDur + 60
    this.stagingUntil = performance.now() + tHop + 1120
    const smooth = (k: number): number => k * k * (3 - 2 * k)
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    t.facing = wdir
    this.lastCam = { x: sideX, y: B.y + 40 }
    this.props.onDashCam?.({ x: sideX, y: B.y + 40, mult: 1.1, fast: true })
    this.props.sfx('hop')
    s.rt.act('jump-tuck', { holdMs: 'persist' })
    this.scriptMove = { fromX, fromY, toX: sideX, toY: fromY, t0: performance.now(), dur: crossDur, arcH: 26, ease: smooth }
    at(crossDur + 60, () => {
      this.props.sfx('whoosh')
      s.rt.act('wallrun', { holdMs: 'persist' })
      this.scriptMove = { fromX: sideX, fromY, toX: sideX, toY: climbTopY, t0: performance.now(), dur: climbDur, arcH: 0, ease: smooth }
    })
    at(tHop, () => {
      this.props.sfx('hop')
      t.facing = spot.x >= sideX ? 1 : -1
      s.rt.act('jump-tuck', { holdMs: 'persist' })
      this.scriptMove = { fromX: sideX, fromY: climbTopY, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur: 450, arcH: 40, ease: smooth }
    })
    at(tHop + 540, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__wallrun:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
      this.props.sfx('fx:shake')
    })
    at(tHop + 1080, () => {
      this.lastCam = null
      this.props.onDashCam?.(null)
      this.chainArrival()
    })
  }

  /** Legacy vaultTo's flight: one authored 500ms arc from the edge to the anchor
   * in the vault art — legacy never asked physics; the planner's ballistic arc
   * can clip panel walls (page 4 repro), so neither do we. Land beats verbatim:
   * hop + shake at 540, arrival at 1080. */
  private vaultStaging(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const spot = this.panelSpot(s.pageIdx, destIdx)
    if (!spot) {
      this.chainArrival()
      return
    }
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const fromX = t.x
    const fromY = t.y
    this.stagingUntil = performance.now() + 1120
    const smooth = (k: number): number => k * k * (3 - 2 * k)
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    this.props.sfx('whoosh')
    t.facing = spot.x >= fromX ? 1 : -1
    this.lastCam = { x: (fromX + spot.x) / 2, y: spot.y - 83 }
    this.props.onDashCam?.({ x: (fromX + spot.x) / 2, y: spot.y - 83, mult: 1.15, fast: true })
    s.rt.act('vault', { holdMs: 'persist' })
    this.scriptMove = { fromX, fromY, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur: 500, arcH: 34, ease: smooth }
    at(540, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__vault:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
      this.props.sfx('hop')
      this.props.sfx('fx:shake')
    })
    at(1080, () => {
      this.lastCam = null
      this.props.onDashCam?.(null)
      this.chainArrival()
    })
  }

  /** The rope crossing, grappled (owner: "shoot a grappling line over to the
   * panel he's going to and walk on that rope" — the bare glide read as walking
   * on air). Beats: throw pose + the hook flies the line across (360ms), the
   * line TWANGS taut (260ms, damped wobble), then the legacy tightrope walk at
   * 115px/s along the DRAWN line — Dash's path dips (arcH −12) and the line's
   * V-vertex rides his live feet, so the rope visibly sags under him — and on
   * landing the near end releases and the line falls away. act:tightrope
   * stages through here too (STAGED_CROSSINGS), keeping its quip. */
  private static ROPE_SHOOT_MS = 360
  private static ROPE_TAUT_MS = 260
  private static ROPE_LINES = ["don't look down.", 'one foot. other foot.', 'balance is a skill. see: SKILLS.']

  private ropeStaging(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const B = this.docV2.pages[s.pageIdx]?.panels[destIdx]
    const spot = this.panelSpot(s.pageIdx, destIdx)
    if (!B || !spot) {
      this.chainArrival()
      return
    }
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const fromX = t.x
    const fromY = t.y
    const footY = fromY - rootDy
    const dir: 1 | -1 = spot.x >= fromX ? 1 : -1
    // Top-edge anchors get a TWO-LEG crossing: the hook bites the panel's near
    // top CORNER (a taut line to mid-panel would slash across the title art),
    // Dash walks the line to the corner, then balances along the rim to the
    // anchor. Interior anchors keep the direct line — there is no rim route.
    const cornerX = dir === 1 ? B.x + 10 : B.x + B.w - 10
    // |dy| — a NEGATIVE dy floats the anchor above the panel (schema-legal);
    // only anchors actually ON the rim get the rim walk (codex finding).
    const twoLeg = Math.abs(B.anchor.dy) <= 6 && Math.abs(spot.x - cornerX) >= 30
    const legAX = twoLeg ? cornerX : spot.x
    const legAY = twoLeg ? B.y : spot.y
    const durA = Math.max(twoLeg ? 700 : 900, (Math.hypot(legAX - fromX, legAY + rootDy - fromY) / 115) * 1000)
    const durB = twoLeg ? Math.max(320, (Math.hypot(spot.x - legAX, spot.y - legAY) / 115) * 1000) : 0
    // The walk takes over exactly when the throw one-shot drains (holdMs W —
    // waiting the full grapple window left a 40ms stand-skin flash between the
    // throw and rope skins; codex finding). The twang's tail is sub-pixel by
    // then, so cutting it 40ms early is invisible.
    const G = EngineLayer.ROPE_SHOOT_MS + EngineLayer.ROPE_TAUT_MS
    const W = G - 40
    this.stagingUntil = performance.now() + W + durA + durB + 700
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    t.facing = dir
    this.lastCam = { x: (fromX + spot.x) / 2, y: spot.y - 93 }
    this.props.onDashCam?.({ x: (fromX + spot.x) / 2, y: spot.y - 93, mult: 1.22, fast: false })
    // the grapple: throw stance while the hook flies out and bites
    s.rt.runOneShot('__rope:throw', [{ verb: 'strikePose', ref: 'throw', holdMs: W }])
    this.props.sfx('whoosh')
    this.armRope({ sx: fromX + dir * 16, sy: footY - 58, tx: legAX + dir * 12, ty: legAY - 2, footX: fromX, footY })
    at(EngineLayer.ROPE_SHOOT_MS, () => this.props.sfx('knock'))
    at(W, () => {
      this.props.sfx('scrape')
      s.rt.act('rope', { holdMs: 'persist' })
      this.ropePhase('walk')
      this.scriptMove = { fromX, fromY, toX: legAX, toY: legAY + rootDy, t0: performance.now(), dur: durA, arcH: -12 }
    })
    at(W + durA * 0.45, () => {
      // the tightrope action keeps its AUTHORED line (its say sits in the cut
      // portion of the migrated doc — codex: staging dice dropped it 65% of
      // the time); the builtin crossing rolls the staging quips.
      if (this.travelKind === 'act:tightrope') {
        this.bubbleNote = { text: "don't look down.", until: performance.now() + 1400 }
      } else if (chance('rope.line', 0.35)) {
        this.bubbleNote = { text: pick('rope.line.pick', EngineLayer.ROPE_LINES), until: performance.now() + 1200 }
      }
    })
    if (twoLeg) {
      // stepping off at the corner: the line has done its job and falls away
      // while he balance-walks the panel rim to the anchor, still in rope art
      at(W + durA, () => {
        this.releaseRope()
        this.scriptMove = { fromX: legAX, fromY: legAY + rootDy, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur: durB, arcH: 0 }
      })
    }
    at(W + durA + durB + 60, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__rope:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
      this.props.sfx('hop')
      this.props.sfx('fx:shake')
      this.releaseRope()
    })
    at(W + durA + durB + 660, () => {
      this.lastCam = null
      this.props.onDashCam?.(null)
      this.chainArrival()
    })
  }

  // ── the grapple line (render-layer fx: a rope path + hook under the actor) ──
  private ropeFx: {
    phase: 'shoot' | 'taut' | 'walk' | 'drop'
    t0: number
    /** near end while airborne (the throwing hand) */
    sx: number
    sy: number
    /** near end once he steps on (the start foothold) */
    footX: number
    footY: number
    /** the hook's bite point */
    tx: number
    ty: number
    /** last-RENDERED geometry — the drop must fall from wherever the line
     * actually was when interrupted (mid-shoot/taut), not snap to the
     * completed span first (codex finding). */
    lastNX?: number
    lastNY?: number
    lastHX?: number
    lastHY?: number
  } | null = null
  private ropeG: SVGGElement | null = null
  private ropeLine: SVGPathElement | null = null
  private ropeHook: SVGGElement | null = null

  private armRope(cfg: { sx: number; sy: number; tx: number; ty: number; footX: number; footY: number }): void {
    this.clearRope()
    const svg = this.svgRef.current
    if (!svg) return
    const NS = 'http://www.w3.org/2000/svg'
    const g = document.createElementNS(NS, 'g') as SVGGElement
    const line = document.createElementNS(NS, 'path') as SVGPathElement
    line.setAttribute('fill', 'none')
    line.setAttribute('stroke', '#1a1a1a')
    line.setAttribute('stroke-width', '2.5')
    line.setAttribute('stroke-linecap', 'round')
    g.appendChild(line)
    const hook = document.createElementNS(NS, 'g') as SVGGElement
    const claws = document.createElementNS(NS, 'path') as SVGPathElement
    claws.setAttribute('d', 'M0,0 l6,-7 M0,0 l8,1 M0,0 l5,7 M0,0 l-9,-1')
    claws.setAttribute('fill', 'none')
    claws.setAttribute('stroke', '#1a1a1a')
    claws.setAttribute('stroke-width', '2.6')
    claws.setAttribute('stroke-linecap', 'round')
    hook.appendChild(claws)
    g.appendChild(hook)
    // under Dash: the actor walks ON the line, never behind it
    svg.insertBefore(g, this.arcWrap)
    this.ropeG = g
    this.ropeLine = line
    this.ropeHook = hook
    this.ropeFx = { phase: 'shoot', t0: performance.now(), ...cfg }
  }

  private ropePhase(phase: 'walk' | 'drop'): void {
    if (!this.ropeFx) return
    this.ropeFx.phase = phase
    this.ropeFx.t0 = performance.now()
  }

  /** Fade-and-fall if a line is up (drag/teardown mid-crossing); no-op otherwise. */
  private releaseRope(): void {
    if (this.ropeFx && this.ropeFx.phase !== 'drop') this.ropePhase('drop')
  }

  private clearRope(): void {
    this.ropeG?.remove()
    this.ropeG = null
    this.ropeLine = null
    this.ropeHook = null
    this.ropeFx = null
  }

  /** Per-rAF rope drawing. `feet` = the interpolated skin ground-centre, so the
   * walk phase's V-vertex tracks exactly where Dash's feet render this frame. */
  private renderRope(feet: { x: number; y: number }): void {
    const fx = this.ropeFx
    if (!fx || !this.ropeLine || !this.ropeHook) return
    const now = performance.now()
    let el = now - fx.t0
    const dir = fx.tx >= fx.sx ? 1 : -1
    // shoot rolls into the taut twang on its own clock
    if (fx.phase === 'shoot' && el >= EngineLayer.ROPE_SHOOT_MS) {
      fx.phase = 'taut'
      fx.t0 += EngineLayer.ROPE_SHOOT_MS
      el = now - fx.t0
    }
    let d = ''
    let hookX = fx.tx
    let hookY = fx.ty
    let opacity = 0.92
    if (fx.phase === 'shoot') {
      const k = 1 - (1 - Math.min(1, el / EngineLayer.ROPE_SHOOT_MS)) ** 3
      hookX = fx.sx + (fx.tx - fx.sx) * k
      hookY = fx.sy + (fx.ty - fx.sy) * k - 30 * k * (1 - k) // slight up-arc
      // the line trails the hook, bowing down behind it
      d = `M${fx.sx},${fx.sy} Q${(fx.sx + hookX) / 2},${(fx.sy + hookY) / 2 + 16 * (1 - k)} ${hookX},${hookY}`
      fx.lastNX = fx.sx
      fx.lastNY = fx.sy
    } else if (fx.phase === 'taut') {
      const k = Math.min(1, el / EngineLayer.ROPE_TAUT_MS)
      // the near end comes down from the hand to the foothold as he readies
      const nx = fx.sx + (fx.footX - fx.sx) * k
      const ny = fx.sy + (fx.footY - fx.sy) * k
      const wob = 15 * Math.exp(-el / 110) * Math.cos(el / 26) // the TWANG
      d = `M${nx},${ny} Q${(nx + fx.tx) / 2},${(ny + fx.ty) / 2 + wob} ${fx.tx},${fx.ty}`
      fx.lastNX = nx
      fx.lastNY = ny
    } else if (fx.phase === 'walk') {
      // taut V through his feet: the line loads where he stands
      const vx = feet.x
      const vy = feet.y + 2
      d =
        `M${fx.footX},${fx.footY} Q${(fx.footX + vx) / 2},${(fx.footY + vy) / 2 + 5} ${vx},${vy}` +
        ` Q${(vx + fx.tx) / 2},${(vy + fx.ty) / 2 + 5} ${fx.tx},${fx.ty}`
      fx.lastNX = fx.footX
      fx.lastNY = fx.footY
    } else {
      // drop: the near end lets go — the line sags away and fades, from
      // wherever it actually was (an interrupted shoot drops the mid-air line)
      const k = Math.min(1, el / 450)
      if (k >= 1) {
        this.clearRope()
        return
      }
      const nx = fx.lastNX ?? fx.footX
      const ny = fx.lastNY ?? fx.footY
      hookX = fx.lastHX ?? fx.tx
      hookY = fx.lastHY ?? fx.ty
      opacity = 0.92 * (1 - k)
      const fall = 34 * k * k
      d = `M${nx},${ny + fall} Q${(nx + hookX) / 2},${(ny + hookY) / 2 + fall + 20 * k} ${hookX},${hookY}`
    }
    if (fx.phase !== 'drop') {
      fx.lastHX = hookX
      fx.lastHY = hookY
    }
    this.ropeLine.setAttribute('d', d)
    this.ropeG?.setAttribute('opacity', String(opacity))
    this.ropeHook.setAttribute('transform', `translate(${hookX},${hookY}) scale(${dir},1)`)
  }

  /** Legacy slideTo's back half: from the own-panel edge, slide DOWN the outer
   * wall face in the slide art (380px/s, min 0.4s, feet to 8px past the panel
   * bottom), then a 500ms tuck arc onto the anchor. Scrape in, hop+shake out. */
  private slideStaging(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const pageIdx = s.pageIdx
    const A = this.docV2.pages[pageIdx]?.panels[this.travelFrom]
    const spot = this.panelSpot(pageIdx, destIdx)
    if (!A || !spot) {
      this.chainArrival()
      return
    }
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const fromX = t.x
    const fromY = t.y
    const sideX = spot.x >= fromX ? A.x + A.w : A.x // the edge faces the destination
    const botY = A.y + A.h + 8 + rootDy // legacy botDy=A.y+A.h−105, feet at +113
    const slideDur = Math.max(400, (Math.abs(botY - fromY) / 380) * 1000)
    const tHop = slideDur + 60
    this.stagingUntil = performance.now() + tHop + 1170
    const smooth = (k: number): number => k * k * (3 - 2 * k)
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    t.facing = spot.x >= fromX ? 1 : -1
    this.props.sfx('scrape')
    this.lastCam = { x: sideX, y: A.y + A.h - 40 }
    this.props.onDashCam?.({ x: sideX, y: A.y + A.h - 40, mult: 1.12, fast: true })
    s.rt.act('slide', { holdMs: 'persist' })
    this.scriptMove = { fromX, fromY, toX: sideX, toY: botY, t0: performance.now(), dur: slideDur, arcH: 0, ease: smooth }
    at(tHop, () => {
      this.props.sfx('hop')
      s.rt.act('jump-tuck', { holdMs: 'persist' })
      this.scriptMove = { fromX: sideX, fromY: botY, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur: 500, arcH: 30, ease: smooth }
    })
    at(tHop + 590, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__slide:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
      this.props.sfx('fx:shake')
    })
    at(tHop + 1130, () => {
      this.lastCam = null
      this.props.onDashCam?.(null)
      this.chainArrival()
    })
  }

  /** Legacy smashTo's exit: after the punches crack the border, burst THROUGH
   * the crack to the anchor at the legacy 220px/s (min 0.5s). Legacy strolled
   * it in the walk pose; a scripted glide can't drive the distance-locked walk
   * skin (frozen feet), so the burst is a tuck — punchier, same beats. */
  private smashStaging(destIdx: number): void {
    const s = this.scene
    if (!s) return
    const spot = this.panelSpot(s.pageIdx, destIdx)
    if (!spot) {
      this.chainArrival()
      return
    }
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const fromX = t.x
    const fromY = t.y
    const dur = Math.max(500, (Math.hypot(spot.x - fromX, spot.y + rootDy - fromY) / 220) * 1000)
    this.stagingUntil = performance.now() + dur + 640
    const smooth = (k: number): number => k * k * (3 - 2 * k)
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    t.facing = spot.x >= fromX ? 1 : -1
    s.rt.act('jump-tuck', { holdMs: 'persist' })
    this.scriptMove = { fromX, fromY, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur, arcH: 24, ease: smooth }
    at(dur + 40, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__smash:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 220 }])
    })
    at(dur + 600, () => this.chainArrival())
  }

  /** A travel run blocked/failed → the legacy escape hatch: POOF. Smoke, teleport
   * to the destination spot (driver-owned placement, like enterPage), arrival. */
  private recoverOrArrive(): void {
    const s = this.scene
    if (!s) return
    const dest = this.travelDest
    const kind = this.travelKind
    this.travelDest = null
    this.travelKind = null
    this.pendingStage = null // a failed approach never stages a crossing from the recovery spot
    this.lastCam = null
    this.props.onDashCam?.(null)
    if (dest != null) {
      const spot = this.panelSpot(s.pageIdx, dest)
      if (spot) {
        // A hop/roll/combo whose ballistic route the planner refuses (owner-edited
        // geometry can make every arc clip a wall — parity 3b) still HOPS: the
        // legacy hopTo tween arc, not a poof. The verb the pool promised plays.
        if (kind === 'builtin:hop' || kind === 'builtin:roll' || kind === 'builtin:combo') {
          this.hopArcRecovery(spot)
          return
        }
        this.props.sfx('fx:smoke')
        s.rt.transform.x = spot.x
        const cap = s.rt.capsule()
        s.rt.transform.y += spot.y - (cap.y1 + cap.r)
        this.props.sfx('poof')
      }
    }
    this.chainArrival()
  }

  /** Legacy hopTo, as failure recovery: windup pause 180, one 920ms tuck arc to
   * the anchor (legacy cubic-bezier ≈ smoothstep), squash-land + shake, arrival. */
  private hopArcRecovery(spot: { x: number; y: number }): void {
    const s = this.scene
    if (!s) return
    const t = s.rt.transform
    const cap = s.rt.capsule()
    const rootDy = t.y - (Math.max(cap.y0, cap.y1) + cap.r)
    const fromX = t.x
    const fromY = t.y
    const dist = Math.hypot(spot.x - fromX, spot.y + rootDy - fromY)
    const arcH = Math.min(110, Math.max(40, dist * 0.22))
    this.stagingUntil = performance.now() + 1740
    const smooth = (k: number): number => k * k * (3 - 2 * k)
    const at = (ms: number, fn: () => void): void => {
      this.backNavTimers.push(window.setTimeout(fn, ms))
    }
    t.facing = spot.x >= fromX ? 1 : -1
    at(180, () => {
      this.props.sfx('hop')
      s.rt.act('jump-tuck', { holdMs: 'persist' })
      this.scriptMove = { fromX, fromY, toX: spot.x, toY: spot.y + rootDy, t0: performance.now(), dur: 920, arcH, ease: smooth }
    })
    at(1140, () => {
      s.rt.clearAct()
      s.rt.runOneShot('__hoprec:land', [{ verb: 'strikePose', ref: 'squash-land', holdMs: 280 }])
      this.props.sfx('hop')
      this.props.sfx('fx:shake')
    })
    at(1680, () => this.chainArrival())
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
   * `landingPanel` is the last panel of the TARGET page (legacy lands there).
   * `onCancel` fires if the staging is torn down before the page-turn moment
   * (doc hot-swap/unmount) so the caller can release its pending gate without
   * navigating (codex: a swallowed done() wedged _backNavPending forever). */
  backNav(kind: 'bomb' | 'poof', landingPanel: number, done: () => void, onCancel?: () => void): void {
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
      onCancel?.()
    }

    const t = s.rt.transform
    const cap = s.rt.capsule()
    const gx = t.x
    const gy = Math.max(cap.y0, cap.y1) + cap.r
    // Leaving the battle backwards kicks the duelist off the page first; the
    // whole legacy timeline then plays shifted by the boot (Dash's transform
    // doesn't move during it, so gx/gy stay valid). at0 = kick-shifted clock.
    const kickMs = this.maybeKickFoe()
    const at0 = (ms: number, fn: () => void): void => at(ms + kickMs, fn)
    this.stagingUntil = performance.now() + kickMs + (kind === 'bomb' ? 2430 : 650)

    if (kind === 'bomb') {
      // Legacy bombBack: throw 300 → bomb arc 580 → boom+hole 950 → hop 1300 →
      // dive 1850 → page turn 2430 (pop-in + land play on the landing page).
      const dirT = gx > STAGE_W / 2 ? -1 : 1
      const txp = Math.max(90, Math.min(STAGE_W - 90, gx + dirT * 175))
      const start = (): void => {
        t.facing = dirT
        s.rt.runOneShot('__backnav:throw', [{ verb: 'strikePose', ref: 'throw', holdMs: 320 }])
        this.props.sfx('scrib')
      }
      if (kickMs > 0) at(kickMs, start)
      else start()
      at0(300, () => this.props.onFx?.({ kind: 'bomb', on: true, x: gx + dirT * 14, y: gy - 75 }))
      at0(360, () => this.props.onFx?.({ kind: 'bomb', on: true, x: txp, y: gy - 12 }))
      at0(950, () => {
        this.props.onFx?.({ kind: 'bomb', on: false })
        this.props.onFx?.({ kind: 'boom', on: true, x: txp, y: gy })
        this.props.onFx?.({ kind: 'hole', on: true, x: txp, y: gy })
        this.props.sfx('boom')
      })
      at0(1300, () => {
        this.props.sfx('hop')
        s.rt.runOneShot('__backnav:tuck', [{ verb: 'strikePose', ref: 'jump-tuck', holdMs: 620 }])
        this.scriptMove = { fromX: t.x, fromY: t.y, toX: txp, toY: t.y, t0: performance.now(), dur: 500, arcH: 46 }
      })
      at0(1850, () => {
        this.playArc('dive', false)
      })
      at0(2350, () => {
        this.actorHidden = true
      })
      at0(2430, () => {
        this.props.onFx?.({ kind: 'boom', on: false })
        this.props.onFx?.({ kind: 'hole', on: false })
        this.pendingEntrance = { kind: 'bombPop', panel: landingPanel }
        this.props.sfx('flip')
        fire()
      })
    } else {
      // Legacy poofBack: smoke 0 → vanish 140 → page turn 650 (smoke + reappear
      // play on the landing page).
      const start = (): void => {
        this.props.sfx('flip')
        this.props.onFx?.({ kind: 'smoke', on: true, x: gx, y: gy - 53 })
      }
      if (kickMs > 0) at(kickMs, start)
      else start()
      at0(140, () => {
        this.actorHidden = true
      })
      at0(650, () => {
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
    window.addEventListener('pointerup', this.onDragUp)
    window.addEventListener('pointercancel', this.onDragBlur)
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
    // Cancel staged choreography outright — the grab owns the figure now
    // (codex P1: a pointer held through an approach's completion let the new
    // staging timeline fight the drag, and a mid-poof cancel could lock the
    // actor hidden / leave overlay fx stranded).
    for (const tm of this.backNavTimers) window.clearTimeout(tm)
    this.backNavTimers = []
    this.scriptMove = null
    this.stagingUntil = 0
    this.actorHidden = false
    this.props.onFx?.({ kind: 'smoke', on: false })
    this.props.onFx?.({ kind: 'crack', on: false })
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
    this.pendingStage = null // a superseded/recovered travel must not stage its crossing later
    this.travelKind = null
    this.rolling = false
    this.airborne = false
    this.spin = 0
    this.lastCam = null
    this.clearArc()
    this.releaseRope() // an interrupted crossing lets the line fall, not freeze
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
    if (this.onDragUp) window.removeEventListener('pointerup', this.onDragUp)
    if (this.onDragBlur) {
      window.removeEventListener('pointercancel', this.onDragBlur)
      window.removeEventListener('blur', this.onDragBlur)
    }
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
  private playArc(kind: 'hop' | 'spin' | 'wob' | 'dive' | 'pop' | 'lungeL' | 'lungeR', fidget: boolean): void {
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
        : kind === 'lungeL' || kind === 'lungeR'
            ? { origin: pts.ground, anim: `battlelunge${kind === 'lungeL' ? 'l' : 'r'} .46s cubic-bezier(.4,.08,.4,1)`, ms: 480 }
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

  /** The ABOUT-page sword fight — the ENGINE is the choreographer. While Dash
   * HOLDS the fight stance (the battle panel's persist arrival) and is idle,
   * every 0.95–1.8s ONE exchange plays, and the FightScene duelist is CUED over
   * battleBus so he answers it (the old design ran a fixed 3.2s CSS cycle the
   * engine only decorated — owner: "not actually fighting each other"):
   *   his attack  → windup/lunge cue now, Dash's shoved recoil + CLANG at the
   *                 shared blade-contact moment (FOE_ATTACK_CONTACT_MS);
   *   Dash's attack → lunge arc now, the duelist's knockback (or the big
   *                 stagger) cued at the lunge's reach (DASH_LUNGE_CONTACT_MS).
   * If the duelist was KICKED off (departure beat) and Dash is back in the
   * stance, he POOFS back in first — the rematch. */
  private static BATTLE_LINES = ['HYAA!', 'en garde.', 'back!! back!!', 'not the fact sheet!!', 'you shall not doodle.', 'parried. obviously.']
  private static REMATCH_LINES = ['you again.', 'round two!!', 'oh. you’re back.']
  private static KICK_LINES = ['and STAY out!!', 'hold that thought—', 'be right back!!', 'gotta run.']

  /** The battle-beat gates: stance held, idle, scene mounted and unstaged. */
  private battleFighting(): boolean {
    const s = this.scene
    return (
      !!s &&
      battleBus.live() &&
      !s.rt.running() &&
      !this.dragging &&
      !this.airborne &&
      s.rt.activeSource().id === 'fight' &&
      performance.now() >= this.stagingUntil
    )
  }

  private scheduleBattle(): void {
    // Fast re-poll while the duelist is off the page: Dash re-entering the
    // stance should get the poof-in within a beat, not a full exchange wait.
    const wait =
      battleBus.live() && !battleBus.foePresent()
        ? scalar('battle.reentryMs', () => 400)
        : scalar('battle.delayMs', () => 950 + Math.random() * 850)
    this.battleTimer = window.setTimeout(() => {
      const s = this.scene
      if (s && this.battleFighting()) {
        if (!battleBus.foePresent()) {
          battleBus.cue('poofin')
          this.props.sfx('poof')
          if (chance('battle.rematch', 0.5)) {
            this.bubbleNote = { text: pick('battle.rematch.line', EngineLayer.REMATCH_LINES), until: performance.now() + 1100 }
          }
        } else if (chance('battle.foeattack', 0.38)) {
          // HIS move: the scene winds up and lunges; Dash takes it on the
          // parry at contact — recoil, then RE-STRIKE the stance (a bare act
          // would release to plain stand when its hold expired, dropping the
          // sword: the persist-held fight acting is what the shove replaced).
          battleBus.cue('attack')
          this.backNavTimers.push(
            window.setTimeout(() => {
              if (!this.battleFighting()) return // a drag/travel broke the exchange
              s.rt.runOneShot('__battle:shoved', [
                { verb: 'strikePose', ref: 'shove', holdMs: 300 },
                { verb: 'strikePose', ref: 'fight', hold: 'persist' },
              ])
              this.props.sfx('knock')
            }, FOE_ATTACK_CONTACT_MS),
          )
        } else {
          // DASH's move: lunge arc now; the duelist takes it on the blade at
          // the reach — knocked back a step, or flung into the big stagger.
          const hard = chance('battle.stagger', 0.3)
          this.playArc(s.rt.transform.facing === -1 ? 'lungeL' : 'lungeR', false)
          this.props.sfx('whoosh')
          this.backNavTimers.push(
            window.setTimeout(() => {
              // Same gate as the shove: a drag/travel/kick that started inside
              // the reach window aborts the exchange — the foe must not play an
              // obsolete knockback under the departure boot (codex finding).
              if (!this.battleFighting()) return
              battleBus.cue(hard ? 'staggered' : 'parried')
              this.props.sfx('knock')
            }, DASH_LUNGE_CONTACT_MS),
          )
          if (chance('battle.line', 0.3)) {
            this.bubbleNote = { text: pick('battle.line.pick', EngineLayer.BATTLE_LINES), until: performance.now() + 1000 }
          }
        }
      }
      this.scheduleBattle()
    }, wait)
  }

  /** The departure boot (owner: Dash never just WALKS out of a sword fight —
   * "kick the guy off screen before leaving the panel"): if he holds the
   * stance with the duelist up, kick him off the page first. Returns the ms
   * the departure must wait (0 = no battle to close out). */
  private maybeKickFoe(): number {
    const s = this.scene
    if (!s || !battleBus.live() || !battleBus.foePresent()) return 0
    if (s.rt.activeSource().id !== 'fight' || s.rt.running()) return 0
    this.stagingUntil = performance.now() + KICK_CLEAR_MS
    s.rt.transform.facing = FOE_SIDE // the duelist fights from Dash's left
    s.rt.runOneShot('__battle:kick', [{ verb: 'strikePose', ref: 'kick', holdMs: 540 }])
    this.playArc(FOE_SIDE === -1 ? 'lungeL' : 'lungeR', false)
    this.props.sfx('whoosh')
    // Hold the shot on the boot — a panel travel has already focused the
    // camera on the DESTINATION (Notebook.travel sets panel state up front).
    const t = s.rt.transform
    this.lastCam = { x: t.x + FOE_SIDE * 30, y: t.y - 30 }
    this.props.onDashCam?.({ ...this.lastCam, mult: 1.12, fast: true })
    this.backNavTimers.push(
      window.setTimeout(() => {
        battleBus.cue('kicked')
        this.props.sfx('knock')
        this.props.sfx('fx:shake')
        if (chance('battle.kickline', 0.4)) {
          this.bubbleNote = { text: pick('battle.kick.line', EngineLayer.KICK_LINES), until: performance.now() + 1000 }
        }
      }, KICK_CONTACT_MS),
    )
    return KICK_CLEAR_MS
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
          const sdir: 1 | -1 = s.rt.transform.x > STAGE_W / 2 ? -1 : 1
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

  /** Q6 — engine speech rides the SHARED legacy bubble. Publishes {text, x, y}
   * to the shell only on change (text or >4px drift), so React isn't churned
   * per frame; the shell renders the same ReactBubble legacy uses. */
  private lastSpeech: { text: string; x: number; y: number } | null = null

  private publishSpeech(skinRoot: { x: number; y: number }): void {
    const s = this.scene
    if (!s || !this.props.onSpeech) return
    let sp = s.rt.speech()
    // Adapter quips (trip 'whoa—', hang 'hup—') fill in when the engine bubble
    // is silent; a real behavior say always wins.
    if (!sp && this.bubbleNote) {
      if (performance.now() < this.bubbleNote.until) sp = { text: this.bubbleNote.text, remainingMs: 1 }
      else this.bubbleNote = null
    }
    if (!sp || this.actorHidden) {
      if (this.lastSpeech) {
        this.lastSpeech = null
        this.props.onSpeech(null)
      }
      return
    }
    // Anchored to the INTERPOLATED skin ground-centre with the legacy offsets
    // (left = centre+14, top = feet−119) — the raw rig head stepped ~6px under
    // the change-throttle while walking (review). 2px threshold keeps churn low.
    const next = { text: sp.text, x: skinRoot.x + 14, y: skinRoot.y - 119 }
    const prev = this.lastSpeech
    if (!prev || prev.text !== next.text || Math.abs(prev.x - next.x) > 2 || Math.abs(prev.y - next.y) > 2) {
      this.lastSpeech = next
      this.props.onSpeech(next)
    }
  }

  render(): ReactNode {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 55, pointerEvents: 'none' }}>
        <svg
          ref={this.svgRef}
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        />
        <div
          ref={(r) => { this.pokeBox = r }}
          data-dash-poke
          onPointerDown={(e) => { e.preventDefault(); this.beginDrag(e) }}
          onClick={() => {
            if (this.dragMoved) { this.dragMoved = false; return } // a drag, not a poke
            this.props.onPoke?.()
            this.poke()
          }}
          style={{ position: 'absolute', left: 0, top: 0, width: 92, height: 130, pointerEvents: 'auto', cursor: 'grab', touchAction: 'none' }}
        />
      </div>
    )
  }
}
