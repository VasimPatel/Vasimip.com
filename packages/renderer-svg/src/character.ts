// Character drawing (charm edition) — turns a SolvedSkeleton into the LEGACY DASH
// visUAL LANGUAGE, measured directly from src/notebook/poses/Idle.tsx:
//
//   • Limbs are CONTINUOUS POLYLINES with round joins (no per-bone seams, no joint
//     dots): torso 5.5, legs 5 (hip→knee→ankle→foot tick), arms 4.5, head outline 4.
//   • The head is a paper-filled circle; the face is dark PUPILS directly on the
//     paper (NO whites — the whites were the googly-eye mistake), angled BROWS that
//     carry the attitude (the determined V at rest), and a tiny mouth (q-curve
//     smile at rest). The eye pair sits offset toward `facing` — the 3/4-view read.
//   • A fist circle appears on a meaningfully bent elbow (legacy Idle's left hand).
//   • The bandana is a tapered pink ribbon (fill #ff5ca8 @ .55, 3px ink outline)
//     drawn from the verlet accessory chain, BEHIND the body.
//   • Squash & stretch: a transient group scale about the character's ground point
//     (the engine's SquashFlourish supplies sx/sy).
//
// Geometry constants are expressed in HEAD RADII so any rig proportion scales.

import type { CharacterDoc, PoseProp, PoseSkinDoc, RigTemplate, SkinElement, SkinKeyframe } from '@dash/schema'
import type { FaceAux, SolvedSkeleton } from '@dash/engine'
import { NEUTRAL_FACE } from '@dash/engine'

const SVG_NS = 'http://www.w3.org/2000/svg'
// Legacy Dash local space: viewBox -60 -75 120 130 rendered 104×113, positioned
// so the figure's ground-centre is local (0, 55). Skin-local → world is
// translate(groundCentre) · scale(SKIN_SX·facing, SKIN_SY) · translate(0, -55).
const SKIN_SX = 104 / 120
const SKIN_SY = 113 / 130
const SKIN_FOOT_Y = 55
const HEAD_JOINT_ID = 'head'
const DEFAULT_COLOR = '#1a1a1a'
const DEFAULT_WIDTH = 5
const DEFAULT_HEAD_FILL = '#fffdf6'
const DEFAULT_CAPE = '#ff5ca8'

// Face geometry in head radii, measured from the legacy Idle art (head r=14):
// eyes at local x −2/+9 (pair centred +3.5 = 0.25r toward facing, ±5.5 = 0.39r),
// y +1 (0.07r below centre); pupil r 2.5 ≈ 0.18r; brows/mouth per the paths.
const EYE_SEP = 0.39
const EYE_FACING = 0.25
const EYE_Y = 0.07
const PUPIL_R = 2 / 14 // legacy rest eyeR is EXACTLY 2 on a 14r head
/** Brows sit OUTWARD of the eyes (legacy centers: eye −0.143r → brow −0.32r;
 * eye +0.643r → brow +0.82r) — the facing-side brow overshoots the outline. */
const BROW_OUT = 0.18
const BROW_Y = -0.34
const BROW_W = 2.6 / 14 // stroke width per head radius
const FIST_R = 4 / 14
const ELBOW_FIST_BEND = 0.8 // rad of elbow bend that reads as a fist

type BrowState = NonNullable<FaceAux['brow']>
type MouthState = NonNullable<FaceAux['mouth']>

/** Per-bone endpoint overrides (verlet follow-through), as before. */
export type EndpointOverrides = Record<string, { ex: number; ey: number }>

/** Charm extras — all optional; omit everything and you get the plain figure. */
export interface RenderExtras {
  /** Squash/stretch scales from the engine flourish (default 1,1 = off). */
  flourish?: { sx: number; sy: number }
  /** Whole-figure spin (rad) about the root — the airborne roll (render-layer). */
  spin?: number
  /** Accessory ribbon point chains (e.g. the bandana), root→tip, world space. */
  accessories?: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
  /** Pupil dilation (1 = rest) — the legacy eyes grow when the cursor is near. */
  pupilScale?: number
  /** Active pose props (sword, spray can…), drawn translated to their anchor
   * joint's END in figure axes. Pass the SAME array identity per pose — the
   * renderer rebuilds elements only when it changes. */
  props?: readonly PoseProp[]
  /** Whole-figure lean (rad, about the ground point) — the legacy cursor lean. */
  lean?: number
  /** Active SKIN source id (pose/clip id, e.g. 'fight' or 'walk-cycle'). When a
   * registered skin matches, the authored legacy drawing replaces the rig figure
   * (chains/head/props hide); null/undefined or no match → rig rendering. */
  skinId?: string | null
  /** The figure's ground-centre in world px — the skin's placement anchor.
   * Required whenever skinId resolves (the caller owns the transform). */
  skinRoot?: { x: number; y: number }
  /** Horizontal facing (1 right, −1 left) — mirrors the skin art. */
  facing?: 1 | -1
  /** Distance-locked gait phase (0..1) for PHASE-DRIVEN skins (docs carrying
   * `strideLen`): every keyframe animation in such a skin is a paused WAAPI
   * animation whose currentTime is set from this each frame — contact beats
   * ride world motion, not wall-clock (quality Q1). Undefined → contact frame. */
  phase?: number
  /** Render-interpolation offset (quality Q2): a presentation-only translate of
   * the whole figure between fixed sim steps. Skins bake it into skinRoot; the
   * RIG figure applies it here as a group translate. */
  offset?: { dx: number; dy: number }
  /** Bounded cape secondary (quality Q3): a small velocity lag (radians) applied
   * to the AUTHORED cape group about its knot socket. The adapter owns easing,
   * clamping, and discontinuity resets; the renderer just rotates. */
  capeLag?: number
}

export interface CharacterRenderer {
  render(solved: SolvedSkeleton, face?: FaceAux, overrides?: EndpointOverrides, extras?: RenderExtras): void
  destroy(): void
}

interface Chain {
  jointIds: string[]
  path: SVGPathElement
  /** Fist circle on the chain tip (arms only; hidden unless the elbow bends). */
  fist?: SVGCircleElement
}

/** Group bones into limb chains: walk up from each leaf to (not including) the
 * first branch point; branch joints become single-bone chains. The head is drawn
 * as a circle, never in a chain. A chain also BREAKS (review findings) where the
 * child attaches at its parent's ORIGIN (the polyline would otherwise draw a bogus
 * parent-end→child-end segment) and where the stroke width changes (one <path> has
 * one width). Order: trunk chains first (drawn under). */
function buildChains(rig: RigTemplate, widths?: Record<string, number>): string[][] {
  const children = new Map<string, string[]>()
  const byId = new Map(rig.joints.map((j) => [j.id, j]))
  for (const j of rig.joints) {
    if (j.parentId) {
      const kids = children.get(j.parentId) ?? []
      kids.push(j.id)
      children.set(j.parentId, kids)
    }
  }
  const nonHeadKids = (id: string) => (children.get(id) ?? []).filter((k) => k !== HEAD_JOINT_ID)
  const claimed = new Set<string>([HEAD_JOINT_ID])
  const chains: string[][] = []
  // Leaves in rig order for determinism.
  for (const j of [...rig.joints].reverse()) {
    if (claimed.has(j.id) || nonHeadKids(j.id).length > 0) continue
    const chain: string[] = []
    let cur: string | null = j.id
    while (cur && !claimed.has(cur)) {
      const joint: RigTemplate['joints'][number] = byId.get(cur)!
      chain.unshift(cur)
      claimed.add(cur)
      const parent: string | null = joint.parentId
      if (!parent || nonHeadKids(parent).length > 1) break
      // Break across origin-attachments and width changes.
      if (joint.attach === 'origin') break
      if ((widths?.[parent] ?? -1) !== (widths?.[cur] ?? -1)) break
      cur = parent
    }
    chains.push(chain)
  }
  // Unclaimed joints (branch points like the pelvis) become single-bone chains,
  // drawn FIRST so limbs paint over the trunk.
  const trunks: string[][] = []
  for (const j of rig.joints) {
    if (!claimed.has(j.id)) trunks.push([j.id])
  }
  return [...trunks, ...chains.reverse()]
}

function isArmChain(jointIds: string[]): boolean {
  return jointIds.some((id) => /arm/i.test(id))
}

/** Synthesize the skins' @keyframes CSS from data (names prefixed 'dskin-' so
 * the legacy site stylesheet — which still defines the ORIGINAL names — can
 * never collide with the data-driven copies). */
function skinKeyframesCss(table: Record<string, SkinKeyframe>): string {
  const out: string[] = []
  for (const [name, k] of Object.entries(table)) {
    const stops: string[] = []
    for (const [off, f] of Object.entries(k.frames)) {
      const parts: string[] = []
      if (f.translate) parts.push(`translate(${f.translate[0]}px, ${f.translate[1]}px)`)
      if (f.rotate !== undefined) parts.push(`rotate(${f.rotate}deg)`)
      if (f.scale) parts.push(`scale(${f.scale[0]}, ${f.scale[1]})`)
      const decls: string[] = []
      if (parts.length > 0) decls.push(`transform: ${parts.join(' ')}`)
      if (f.opacity !== undefined) decls.push(`opacity: ${f.opacity}`)
      stops.push(`${off}% { ${decls.join('; ')} }`)
    }
    out.push(`@keyframes dskin-${name} { ${stops.join(' ')} }`)
  }
  return out.join('\n')
}

export function createCharacterRenderer(
  svgRoot: SVGSVGElement,
  character: CharacterDoc,
  rig: RigTemplate,
  opts?: {
    /** World angle (rad) of the head bone in the character's REST pose. The face
     * renders LEVEL at rest (the legacy face never inherits the head bone's
     * standing 8° offset) and rotates only with DEVIATIONS from rest — a tuck
     * still carries the face around. */
    faceRestAngle?: number
    /** Expressive data skins (parity Stage 2b): the shared keyframes table plus
     * the pose-skin docs. The renderer synthesizes one <style> block (names
     * prefixed 'dskin-' so the site's legacy stylesheet can't collide) and swaps
     * whole-figure authored drawings by extras.skinId. */
    skins?: { keyframes: Record<string, SkinKeyframe>; docs: readonly PoseSkinDoc[] }
  },
): CharacterRenderer {
  const color = character.style?.color ?? DEFAULT_COLOR
  const baseWidth = character.style?.width ?? DEFAULT_WIDTH
  const widths = character.style?.widths
  const headFill = character.palette?.head ?? DEFAULT_HEAD_FILL
  const capeFill = character.palette?.cape ?? DEFAULT_CAPE
  const props = character.proportions

  const group = document.createElementNS(SVG_NS, 'g') as SVGGElement
  group.setAttribute('data-dash-renderer', character.id)

  // ── accessory ribbons (behind everything) ──────────────────────────────────────
  const ribbons: SVGPathElement[] = []
  function ensureRibbon(i: number): SVGPathElement {
    while (ribbons.length <= i) {
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute('fill', capeFill)
      p.setAttribute('fill-opacity', '0.55')
      p.setAttribute('stroke', color)
      p.setAttribute('stroke-width', '3')
      p.setAttribute('stroke-linejoin', 'round')
      group.insertBefore(p, group.firstChild)
      ribbons.push(p)
    }
    return ribbons[i]
  }

  // ── limb chains ────────────────────────────────────────────────────────────────
  // Faded chains (style.opacities < 1 on their first joint) are the FAR limbs —
  // the legacy walk draws them first, UNDER the trunk, at .85 and a hair thinner.
  const opacities = character.style?.opacities
  const chainOpacity = (jointIds: string[]): number => opacities?.[jointIds[0]] ?? 1
  const chainDefs = [...buildChains(rig, widths)].sort((a, b) => chainOpacity(a) - chainOpacity(b))
  const chains: Chain[] = []
  for (const jointIds of chainDefs) {
    const path = document.createElementNS(SVG_NS, 'path')
    const w = widths?.[jointIds[0]] ?? baseWidth
    path.setAttribute('d', 'M0,0')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', color)
    path.setAttribute('stroke-width', String(w))
    path.setAttribute('stroke-linecap', character.style?.linecap ?? 'round')
    path.setAttribute('stroke-linejoin', 'round')
    const op = chainOpacity(jointIds)
    if (op < 1) path.setAttribute('stroke-opacity', String(op))
    group.appendChild(path)
    const chain: Chain = { jointIds, path }
    if (isArmChain(jointIds)) {
      const fist = document.createElementNS(SVG_NS, 'circle')
      fist.setAttribute('r', '0')
      fist.setAttribute('fill', color)
      if (op < 1) fist.setAttribute('fill-opacity', String(op))
      group.appendChild(fist)
      chain.fist = fist
    }
    chains.push(chain)
  }

  // ── head + face ────────────────────────────────────────────────────────────────
  const headJoint = rig.joints.find((j) => j.id === HEAD_JOINT_ID)
  const headR = headJoint ? headJoint.length * (props?.[HEAD_JOINT_ID] ?? 1) : 0
  let headEl: SVGCircleElement | null = null
  let faceGroup: SVGGElement | null = null
  let pupils: SVGEllipseElement[] = []
  let brows: SVGPathElement[] = []
  let mouthEl: SVGPathElement | null = null

  if (headJoint) {
    headEl = document.createElementNS(SVG_NS, 'circle')
    headEl.setAttribute('r', String(headR))
    headEl.setAttribute('fill', headFill)
    headEl.setAttribute('stroke', color)
    headEl.setAttribute('stroke-width', String(widths?.[HEAD_JOINT_ID] ?? baseWidth))
    group.appendChild(headEl)

    faceGroup = document.createElementNS(SVG_NS, 'g') as SVGGElement
    for (let i = 0; i < 2; i++) {
      const pupil = document.createElementNS(SVG_NS, 'ellipse')
      pupil.setAttribute('rx', String(PUPIL_R * headR))
      pupil.setAttribute('ry', String(PUPIL_R * headR))
      pupil.setAttribute('fill', color)
      faceGroup.appendChild(pupil)
      pupils.push(pupil)
    }
    for (let i = 0; i < 2; i++) {
      const brow = document.createElementNS(SVG_NS, 'path')
      brow.setAttribute('fill', 'none')
      brow.setAttribute('stroke', color)
      brow.setAttribute('stroke-width', String(BROW_W * headR))
      brow.setAttribute('stroke-linecap', 'round')
      faceGroup.appendChild(brow)
      brows.push(brow)
    }
    mouthEl = document.createElementNS(SVG_NS, 'path')
    mouthEl.setAttribute('fill', 'none')
    mouthEl.setAttribute('stroke', color)
    mouthEl.setAttribute('stroke-width', String(BROW_W * headR))
    mouthEl.setAttribute('stroke-linecap', 'round')
    faceGroup.appendChild(mouthEl)
    group.appendChild(faceGroup)

    // PAINT ORDER (P2 convention, regressed by the charm rewrite and caught by the
    // dangle/hang/swing drafts): the head circle sits BEHIND the limb chains so
    // raised arms paint over it — but the FACE stays on top of everything so eyes
    // and brows never get crossed out by a limb.
    const firstChain = chains[0]?.path
    if (firstChain) group.insertBefore(headEl, firstChain)
  }

  // ── pose props (sword, spray can…) — over the limbs, under the face ─────────────
  const propGroup = document.createElementNS(SVG_NS, 'g') as SVGGElement
  if (faceGroup) group.insertBefore(propGroup, faceGroup)
  else group.appendChild(propGroup)
  let propsKey: readonly PoseProp[] | null = null
  let propAnchors: Array<{ joint: string; g: SVGGElement }> = []

  function rebuildProps(props: readonly PoseProp[] | undefined): void {
    propsKey = props ?? null
    propGroup.textContent = ''
    propAnchors = []
    for (const prop of props ?? []) {
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
      for (const e of prop.elements) {
        let el: SVGElement
        if (e.kind === 'path') {
          el = document.createElementNS(SVG_NS, 'path')
          el.setAttribute('d', e.d ?? 'M0,0')
          el.setAttribute('fill', e.fill ?? 'none')
        } else if (e.kind === 'circle') {
          el = document.createElementNS(SVG_NS, 'circle')
          el.setAttribute('cx', String(e.cx ?? 0))
          el.setAttribute('cy', String(e.cy ?? 0))
          el.setAttribute('r', String(e.r ?? 1))
          el.setAttribute('fill', e.fill ?? color)
        } else {
          el = document.createElementNS(SVG_NS, 'rect')
          el.setAttribute('x', String(e.x ?? 0))
          el.setAttribute('y', String(e.y ?? 0))
          el.setAttribute('width', String(e.w ?? 1))
          el.setAttribute('height', String(e.h ?? 1))
          if (e.rx !== undefined) el.setAttribute('rx', String(e.rx))
          el.setAttribute('fill', e.fill ?? 'none')
        }
        if (e.stroke) el.setAttribute('stroke', e.stroke)
        if (e.strokeWidth !== undefined) el.setAttribute('stroke-width', String(e.strokeWidth))
        if (e.opacity !== undefined) el.setAttribute('opacity', String(e.opacity))
        el.setAttribute('stroke-linecap', 'round')
        // Render-layer flutter (the legacy sprayjit) — keyframes come from the
        // page's stylesheet; absent (headless harness) it's simply static.
        if (e.jitter) (el as SVGElement & { style: CSSStyleDeclaration }).style.animation = 'sprayjit .3s linear infinite'
        g.appendChild(el)
      }
      propGroup.appendChild(g)
      propAnchors.push({ joint: prop.joint, g })
    }
  }

  // ── expressive data skins ───────────────────────────────────────────────────────
  // One <g> per skin doc, built lazily and cached; the OUTER group carries the
  // world placement (per frame), an INNER group carries the skin's whole-figure
  // animation, exactly mirroring the legacy component structure. While a skin is
  // active the rig figure (chains/head/fists/props) hides; the verlet ribbons
  // stay (the engine cape is engine-owned charm) and squash/spin/lean still wrap
  // everything via the outer renderer group.
  const skinBySource = new Map<string, PoseSkinDoc>()
  for (const doc of opts?.skins?.docs ?? []) for (const s of doc.sources) skinBySource.set(s, doc)
  interface SkinEntry {
    outer: SVGGElement
    doc: PoseSkinDoc
    /** Paused WAAPI animations for phase-driven skins (strideLen docs). */
    phaseAnims: Array<{ anim: Animation; durMs: number; offsetMs: number }>
    /** The authored cape group (Q3) — rotated about its socket for the lag. */
    capeGroup: SVGGElement | null
    capeSocket: { x: number; y: number } | null
  }
  const skinGroups = new Map<string, SkinEntry>()
  let activeSkin: SkinEntry | null = null
  const skinLayer = document.createElementNS(SVG_NS, 'g') as SVGGElement
  if (faceGroup) group.insertBefore(skinLayer, faceGroup)
  else group.appendChild(skinLayer)

  let skinStyleEl: SVGStyleElement | null = null
  if (opts?.skins && Object.keys(opts.skins.keyframes).length > 0) {
    skinStyleEl = document.createElementNS(SVG_NS, 'style') as SVGStyleElement
    skinStyleEl.textContent = skinKeyframesCss(opts.skins.keyframes)
    svgRoot.appendChild(skinStyleEl)
  }

  function animShorthand(name: string, delaySec?: number): string {
    const k = opts?.skins?.keyframes[name]
    if (!k) return ''
    const parts = [`dskin-${name}`, `${k.duration}s`, k.ease ?? 'ease-in-out']
    if (delaySec !== undefined) parts.push(`${delaySec}s`)
    const iter = k.iterations ?? 'infinite'
    parts.push(String(iter))
    if (k.fill === 'forwards') parts.push('forwards')
    return parts.join(' ')
  }

  /** WAAPI keyframes from skin data — the SAME numbers the CSS synthesis uses,
   * so a phase-driven animation and its wall-clock twin are pixel-identical. */
  function waapiFrames(k: SkinKeyframe): Keyframe[] {
    const stops = Object.entries(k.frames)
      .map(([off, f]) => ({ off: Number(off) / 100, f }))
      .sort((a, b) => a.off - b.off)
    return stops.map(({ off, f }) => {
      const parts: string[] = []
      if (f.translate) parts.push(`translate(${f.translate[0]}px, ${f.translate[1]}px)`)
      if (f.rotate !== undefined) parts.push(`rotate(${f.rotate}deg)`)
      if (f.scale) parts.push(`scale(${f.scale[0]}, ${f.scale[1]})`)
      const kf: Keyframe = { offset: off, easing: k.ease ?? 'ease-in-out' }
      if (parts.length > 0) kf.transform = parts.join(' ')
      if (f.opacity !== undefined) kf.opacity = f.opacity
      return kf
    })
  }

  /** Attach an animation to a skin element: phase-driven skins get a PAUSED
   * WAAPI instance (currentTime set per frame from the gait phase); decorative
   * skins keep the CSS wall-clock shorthand. A negative legacy delay shifts the
   * cycle start (CSS -0.34s == 340ms into the loop). */
  function attachAnim(el: SVGElement, name: string, delaySec: number | undefined, collector: SkinEntry['phaseAnims'] | null): void {
    const k = opts?.skins?.keyframes[name]
    if (!k) return
    if (collector) {
      const durMs = k.duration * 1000
      const anim = el.animate(waapiFrames(k), { duration: durMs, iterations: Infinity })
      anim.pause()
      anim.currentTime = 0
      const offsetMs = ((-(delaySec ?? 0) * 1000) % durMs + durMs) % durMs
      collector.push({ anim, durMs, offsetMs })
    } else {
      el.style.animation = animShorthand(name, delaySec)
    }
  }

  function buildSkinElement(e: SkinElement, collector: SkinEntry['phaseAnims'] | null): SVGElement {
    if (e.kind === 'group') {
      const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
      if (e.transform) {
        // SVG-attribute syntax (unitless, the legacy positioning wrappers) goes on
        // the attribute; CSS syntax (px/deg — legacy style transforms) on style.
        if (/(px|deg|rad)/.test(e.transform)) g.style.transform = e.transform
        else g.setAttribute('transform', e.transform)
      }
      if (e.anim) {
        g.style.transformBox = 'fill-box'
        if (e.origin) g.style.transformOrigin = e.origin
        attachAnim(g, e.anim.name, e.anim.delaySec, collector)
      } else if (e.origin) {
        g.style.transformBox = 'fill-box'
        g.style.transformOrigin = e.origin
      }
      for (const c of e.children) g.appendChild(buildSkinElement(c, collector))
      return g
    }
    let el: SVGElement
    if (e.kind === 'path') {
      el = document.createElementNS(SVG_NS, 'path')
      el.setAttribute('d', e.d)
    } else if (e.kind === 'circle') {
      el = document.createElementNS(SVG_NS, 'circle')
      el.setAttribute('cx', String(e.cx))
      el.setAttribute('cy', String(e.cy))
      el.setAttribute('r', String(e.r))
    } else if (e.kind === 'ellipse') {
      el = document.createElementNS(SVG_NS, 'ellipse')
      el.setAttribute('cx', String(e.cx))
      el.setAttribute('cy', String(e.cy))
      el.setAttribute('rx', String(e.rx))
      el.setAttribute('ry', String(e.ry))
    } else {
      el = document.createElementNS(SVG_NS, 'rect')
      el.setAttribute('x', String(e.x))
      el.setAttribute('y', String(e.y))
      el.setAttribute('width', String(e.w))
      el.setAttribute('height', String(e.h))
      if (e.rx !== undefined) el.setAttribute('rx', String(e.rx))
    }
    if (e.fill !== undefined) el.setAttribute('fill', e.fill)
    else el.setAttribute('fill', 'none')
    if (e.stroke) el.setAttribute('stroke', e.stroke)
    if (e.strokeWidth !== undefined) el.setAttribute('stroke-width', String(e.strokeWidth))
    if (e.linecap) el.setAttribute('stroke-linecap', e.linecap)
    el.setAttribute('stroke-linejoin', 'round')
    if (e.opacity !== undefined) el.setAttribute('opacity', String(e.opacity))
    return el
  }

  function skinGroupFor(doc: PoseSkinDoc): SkinEntry {
    const cached = skinGroups.get(doc.id)
    if (cached) return cached
    const outer = document.createElementNS(SVG_NS, 'g') as SVGGElement
    const inner = document.createElementNS(SVG_NS, 'g') as SVGGElement
    const entry: SkinEntry = { outer, doc, phaseAnims: [], capeGroup: null, capeSocket: null }
    const collector = doc.strideLen !== undefined ? entry.phaseAnims : null
    if (doc.groupAnim) {
      inner.style.transformBox = 'fill-box'
      inner.style.transformOrigin = doc.groupAnim.origin ?? '50% 88%'
      attachAnim(inner, doc.groupAnim.name, doc.groupAnim.delaySec, collector)
    }
    // The AUTHORED cape paints FIRST (legacy: cape is element #1, behind the
    // body); the lag rotation composes on this wrapper via the SVG transform
    // attribute (explicit socket centre in skin-local units).
    if (doc.cape) {
      const capeG = document.createElementNS(SVG_NS, 'g') as SVGGElement
      for (const e of doc.cape.elements) capeG.appendChild(buildSkinElement(e, collector))
      inner.appendChild(capeG)
      entry.capeGroup = capeG
      entry.capeSocket = { ...doc.cape.socket }
    }
    for (const e of doc.elements) inner.appendChild(buildSkinElement(e, collector))
    outer.appendChild(inner)
    outer.style.display = 'none'
    skinLayer.appendChild(outer)
    skinGroups.set(doc.id, entry)
    return entry
  }

  function setRigVisible(visible: boolean): void {
    const disp = visible ? '' : 'none'
    for (const c of chains) {
      c.path.style.display = disp
      if (c.fist) c.fist.style.display = disp
    }
    if (headEl) headEl.style.display = disp
    propGroup.style.display = disp
  }

  /** Swap the visible skin (or back to the rig). display:none unloads CSS
   * animations, so re-showing a cached skin RESTARTS them from 0 — the same
   * behavior as the legacy React component remount. */
  function swapSkin(next: SkinEntry | null): void {
    if (activeSkin === next) return
    if (activeSkin) activeSkin.outer.style.display = 'none'
    activeSkin = next
    if (next) next.outer.style.display = ''
    setRigVisible(next === null)
    if (faceGroup) faceGroup.style.display = next && next.doc.face !== 'parametric' ? 'none' : ''
  }

  svgRoot.appendChild(group)

  // ── face state drawing (all in head-local px; the face group carries the head
  //    transform). Measured from the legacy art; states interpolate by intensity. ──
  function browD(side: -1 | 1, state: BrowState, intensity: number, facing: 1 | -1): string {
    const r = headR
    // Determined (rest): inner ends low, outer ends high-in → the angry V.
    // Angles are the brow stroke slope in rad; height is the y of the brow centre.
    const cfg: Record<BrowState, { slope: number; y: number }> = {
      determined: { slope: 0.28, y: BROW_Y * r },
      fierce: { slope: 0.45, y: -0.39 * r }, // the legacy Fight brows (l11,5)
      neutral: { slope: 0.08, y: -0.4 * r },
      raised: { slope: -0.05, y: -0.56 * r },
      worried: { slope: -0.3, y: -0.44 * r },
    }
    const rest = cfg.determined
    const c = cfg[state]
    const slope = rest.slope + (c.slope - rest.slope) * intensity
    const y = rest.y + (c.y - rest.y) * intensity
    const browX = (EYE_FACING * facing + (EYE_SEP + BROW_OUT) * side) * r
    const half = 0.32 * r
    // Slope tilts toward the nose: mirror by side (and facing flips the nose).
    const dy = slope * half * side * facing
    return `M${browX - half},${y + dy} L${browX + half},${y - dy}`
  }

  function mouthD(state: MouthState, intensity: number, facing: 1 | -1): string {
    const r = headR
    const mx = 0.35 * r * facing
    const my = 0.62 * r
    switch (state) {
      case 'smile': {
        // Legacy: M(0.07r, 0.64r) q(+0.36r, +0.18r·k) (+0.64r, −0.07r·k) — starts
        // near centre, dips toward the chin, hooks up on the facing side.
        const k = 0.7 + 0.6 * intensity
        const x0 = 0.07 * r * facing
        return `M${x0},${0.64 * r} q${0.36 * r * facing},${0.18 * r * k} ${0.64 * r * facing},${-0.07 * r * k}`
      }
      case 'grit': {
        const w = 0.5 * r * (0.7 + 0.3 * intensity)
        return `M${mx - w / 2},${my} l${w},0`
      }
      case 'o': {
        const or = (0.1 + 0.08 * intensity) * r
        return `M${mx - or},${my} a${or},${or} 0 1,0 ${or * 2},0 a${or},${or} 0 1,0 ${-or * 2},0`
      }
      case 'none':
        return 'M0,0'
    }
  }

  function elbowBend(solved: SolvedSkeleton, jointIds: string[]): number {
    if (jointIds.length < 2) return 0
    const upper = bone(solved, jointIds[jointIds.length - 2])
    const fore = bone(solved, jointIds[jointIds.length - 1])
    if (!upper || !fore) return 0
    let d = fore.worldAngle - upper.worldAngle
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    return Math.abs(d)
  }

  function ribbonD(pts: ReadonlyArray<{ x: number; y: number }>): string {
    if (pts.length < 2) return 'M0,0'
    // Tapered ribbon — a FLAG, so it's narrow at the knot and WIDEST at the fly
    // end (owner feedback: the root-wide taper read long and thin), then the
    // swallow-tail notch cuts the wide end.
    const rootW = 5
    const tipW = 11.5
    const up: string[] = []
    const down: string[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const w = rootW + (tipW - rootW) * (i / (pts.length - 1))
      up.push(`${pts[i].x + nx * w},${pts[i].y + ny * w}`)
      down.unshift(`${pts[i].x - nx * w},${pts[i].y - ny * w}`)
    }
    // Swallow-tail: a wedge cut into the tip (the legacy flag's V-notch).
    const tip = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    const dx = tip.x - prev.x
    const dy = tip.y - prev.y
    const dl = Math.hypot(dx, dy) || 1
    const notch = `${tip.x - (dx / dl) * 5},${tip.y - (dy / dl) * 5}`
    return `M${up.join(' L')} L${notch} L${down.join(' L')} Z`
  }

  // solveFk emits bones in rig-joint order — index once, no per-render Map.
  const boneIndex = new Map<string, number>()
  rig.joints.forEach((j, i) => boneIndex.set(j.id, i))
  const rootIndex = Math.max(0, rig.joints.findIndex((j) => j.parentId === null))
  const bone = (solved: SolvedSkeleton, id: string) => {
    const i = boneIndex.get(id)
    return i === undefined ? undefined : solved.bones[i]
  }

  /** Head circle + parametric face — two anchor modes: the solved head bone (rig
   * figure) or the active skin's authored head anchor (parametric skins; baked
   * skins hide the face entirely — their drawing carries its own). */
  function renderFace(solved: SolvedSkeleton, face: FaceAux, overrides?: EndpointOverrides, extras?: RenderExtras): void {
    if (!faceGroup) return
    let hx: number
    let hy: number
    let rot = 0
    let fs = 1
    if (activeSkin) {
      if (activeSkin.doc.face !== 'parametric') return // baked — hidden by swapSkin
      const sr = extras?.skinRoot
      if (!sr) return
      const facingS = extras?.facing ?? 1
      const a = activeSkin.doc.head ?? { cx: 2, cy: -30, r: 14 }
      hx = sr.x + SKIN_SX * facingS * a.cx
      hy = sr.y + SKIN_SY * (a.cy - SKIN_FOOT_Y)
      fs = (a.r * SKIN_SY) / headR // face geometry is authored in rig headR units
      faceGroup.style.transform = `translate(${hx}px, ${hy}px) scale(${fs})`
    } else {
      const head = bone(solved, HEAD_JOINT_ID)
      if (!head || !headEl) return
      hx = overrides?.[HEAD_JOINT_ID]?.ex ?? head.ex
      hy = overrides?.[HEAD_JOINT_ID]?.ey ?? head.ey
      headEl.setAttribute('cx', String(hx))
      headEl.setAttribute('cy', String(hy))
      rot = head.worldAngle - (opts?.faceRestAngle ?? -Math.PI / 2)
      faceGroup.style.transform = `translate(${hx}px, ${hy}px) rotate(${rot}rad)`
    }

    const facing = face.facing ?? 1
    const intensity = face.intensity ?? 0.5
    const openY = 1 - Math.min(1, Math.max(0, face.blink))
    const maxOff = 0.2 * headR
    let dx = face.pupilDx
    let dy = face.pupilDy
    const len = Math.hypot(dx, dy)
    if (len > maxOff && len > 0) {
      dx = (dx / len) * maxOff
      dy = (dy / len) * maxOff
    }
    // Dilation: the legacy eyes grow toward the cursor (eyeR 2 → 3.1 near).
    const pr = PUPIL_R * headR * (extras?.pupilScale ?? 1)
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const ex = (EYE_FACING * facing + EYE_SEP * side) * headR + dx
      const ey = EYE_Y * headR + dy
      pupils[i].setAttribute('cx', String(ex))
      pupils[i].setAttribute('cy', String(ey))
      pupils[i].setAttribute('rx', String(pr))
      pupils[i].setAttribute('ry', String(pr * openY))
      brows[i].setAttribute('d', browD(side as -1 | 1, face.brow ?? 'determined', intensity, facing))
    }
    if (mouthEl) mouthEl.setAttribute('d', mouthD(face.mouth ?? 'smile', intensity, facing))
  }

  return {
    render(solved, face: FaceAux = NEUTRAL_FACE, overrides?, extras?): void {

      // Squash pivot: the figure's ground point (root x, lowest extent).
      let groundY = -Infinity
      for (const b of solved.bones) if (b.ey > groundY) groundY = b.ey
      const root = solved.bones[rootIndex]
      const rootX = root ? root.ox : 0
      const fl = extras?.flourish
      const spin = extras?.spin ?? 0
      const lean = extras?.lean ?? 0
      const off = extras?.offset
      const hasOff = !!off && !activeSkin && (Math.abs(off.dx) > 0.01 || Math.abs(off.dy) > 0.01)
      const hasScale = !!fl && (Math.abs(fl.sx - 1) > 0.004 || Math.abs(fl.sy - 1) > 0.004)
      if (hasOff || hasScale || Math.abs(spin) > 0.01 || Math.abs(lean) > 0.004) {
        // Two independent pivots: squash scales about the GROUND point (feet stay
        // planted — the documented flourish contract) while spin rotates about the
        // figure centre so the roll reads as a tumble, not a ground-pinned sweep.
        const midY = groundY - 55
        const parts: string[] = []
        if (hasOff && off) parts.push(`translate(${off.dx}px, ${off.dy}px)`)
        if (hasScale && fl) {
          parts.push(`translate(${rootX}px, ${groundY}px)`, `scale(${fl.sx}, ${fl.sy})`, `translate(${-rootX}px, ${-groundY}px)`)
        }
        if (Math.abs(spin) > 0.01) {
          parts.push(`translate(${rootX}px, ${midY}px)`, `rotate(${spin}rad)`, `translate(${-rootX}px, ${-midY}px)`)
        }
        // Cursor lean — the legacy standing Dash tips toward a near cursor,
        // pivoting at his feet (legacy transform-origin 50% 88%).
        if (Math.abs(lean) > 0.004) {
          parts.push(`translate(${rootX}px, ${groundY}px)`, `rotate(${lean}rad)`, `translate(${-rootX}px, ${-groundY}px)`)
        }
        group.style.transform = parts.join(' ')
      } else if (group.style.transform) {
        group.style.transform = ''
      }

      // Expressive skin: when the active source has a registered drawing, it
      // REPLACES the rig figure — placed at the ground-centre, mirrored by
      // facing; the inner CSS animations carry the legacy internal acting.
      const skinDoc = extras?.skinId ? skinBySource.get(extras.skinId) : undefined
      swapSkin(skinDoc ? skinGroupFor(skinDoc) : null)
      if (activeSkin && extras?.skinRoot) {
        const sr = extras.skinRoot
        const facing = extras.facing ?? 1
        activeSkin.outer.setAttribute(
          'transform',
          `translate(${sr.x},${sr.y}) scale(${SKIN_SX * facing},${SKIN_SY}) translate(0,${-SKIN_FOOT_Y})`,
        )
        // Phase-driven skins: one motion clock — set every paused animation's
        // currentTime from the distance-locked gait phase (quality Q1).
        if (activeSkin.phaseAnims.length > 0) {
          const phase = extras.phase ?? 0
          for (const pa of activeSkin.phaseAnims) {
            pa.anim.currentTime = (phase * pa.durMs + pa.offsetMs) % pa.durMs
          }
        }
        // Bounded cape secondary (Q3): rotate the authored cape about its knot.
        if (activeSkin.capeGroup && activeSkin.capeSocket) {
          const lag = extras.capeLag ?? 0
          if (Math.abs(lag) > 0.002) {
            activeSkin.capeGroup.setAttribute(
              'transform',
              `rotate(${(lag * 180) / Math.PI} ${activeSkin.capeSocket.x} ${activeSkin.capeSocket.y})`,
            )
          } else if (activeSkin.capeGroup.hasAttribute('transform')) {
            activeSkin.capeGroup.removeAttribute('transform')
          }
        }
      }

      // Accessory ribbons: the PHYSICS cape draws only for the rig figure or
      // capeless skins — an authored skin cape is the silhouette authority (Q3).
      const accs = activeSkin?.doc.cape ? [] : (extras?.accessories ?? [])
      for (let i = 0; i < accs.length; i++) ensureRibbon(i).setAttribute('d', ribbonD(accs[i]))
      for (let i = accs.length; i < ribbons.length; i++) ribbons[i].setAttribute('d', 'M0,0')

      if (activeSkin) {
        // The rig figure is hidden; only the (possibly parametric) face remains.
        renderFace(solved, face, overrides, extras)
        return
      }

      // Pose props: rebuild when the active pose's prop set changes, then ride
      // the anchor joint's end point every frame.
      if ((extras?.props ?? null) !== propsKey) rebuildProps(extras?.props)
      for (const pa of propAnchors) {
        const bn = bone(solved, pa.joint)
        if (bn) pa.g.setAttribute('transform', `translate(${bn.ex},${bn.ey})`)
      }

      // Limb chains: continuous polylines; overrides replace bone ENDS.
      for (const chain of chains) {
        const first = bone(solved, chain.jointIds[0])
        if (!first) continue
        let d = `M${first.ox},${first.oy}`
        let lastX = first.ox
        let lastY = first.oy
        for (const id of chain.jointIds) {
          const bn = bone(solved, id)
          if (!bn) continue
          const ov = overrides?.[id]
          lastX = ov ? ov.ex : bn.ex
          lastY = ov ? ov.ey : bn.ey
          d += ` L${lastX},${lastY}`
        }
        chain.path.setAttribute('d', d)
        if (chain.fist) {
          const bend = elbowBend(solved, chain.jointIds)
          const show = bend > ELBOW_FIST_BEND
          chain.fist.setAttribute('r', show ? String(FIST_R * headR) : '0')
          if (show) {
            chain.fist.setAttribute('cx', String(lastX))
            chain.fist.setAttribute('cy', String(lastY))
          }
        }
      }

      renderFace(solved, face, overrides, extras)
    },
    destroy(): void {
      group.remove()
      skinStyleEl?.remove()
      pupils = []
      brows = []
      mouthEl = null
    },
  }
}
