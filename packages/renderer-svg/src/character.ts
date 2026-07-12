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

import type { CharacterDoc, RigTemplate } from '@dash/schema'
import type { FaceAux, SolvedSkeleton } from '@dash/engine'
import { NEUTRAL_FACE } from '@dash/engine'

const SVG_NS = 'http://www.w3.org/2000/svg'
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
const PUPIL_R = 0.18
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
  /** Accessory ribbon point chains (e.g. the bandana), root→tip, world space. */
  accessories?: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
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

export function createCharacterRenderer(
  svgRoot: SVGSVGElement,
  character: CharacterDoc,
  rig: RigTemplate,
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
  const chainDefs = buildChains(rig, widths)
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
    group.appendChild(path)
    const chain: Chain = { jointIds, path }
    if (isArmChain(jointIds)) {
      const fist = document.createElementNS(SVG_NS, 'circle')
      fist.setAttribute('r', '0')
      fist.setAttribute('fill', color)
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
  }

  svgRoot.appendChild(group)

  // ── face state drawing (all in head-local px; the face group carries the head
  //    transform). Measured from the legacy art; states interpolate by intensity. ──
  function browD(side: -1 | 1, state: BrowState, intensity: number, facing: 1 | -1): string {
    const r = headR
    // Determined (rest): inner ends low, outer ends high-in → the angry V.
    // Angles are the brow stroke slope in rad; height is the y of the brow centre.
    const cfg: Record<BrowState, { slope: number; y: number }> = {
      determined: { slope: 0.28, y: -0.4 * r },
      neutral: { slope: 0.08, y: -0.44 * r },
      raised: { slope: -0.05, y: -0.6 * r },
      worried: { slope: -0.3, y: -0.48 * r },
    }
    const rest = cfg.determined
    const c = cfg[state]
    const slope = rest.slope + (c.slope - rest.slope) * intensity
    const y = rest.y + (c.y - rest.y) * intensity
    const eyeX = (EYE_FACING * facing + EYE_SEP * side) * r
    const half = 0.32 * r
    // Slope tilts toward the nose: mirror by side (and facing flips the nose).
    const dy = slope * half * side * facing
    return `M${eyeX - half},${y + dy} L${eyeX + half},${y - dy}`
  }

  function mouthD(state: MouthState, intensity: number, facing: 1 | -1): string {
    const r = headR
    const mx = 0.1 * r * facing
    const my = 0.62 * r
    switch (state) {
      case 'smile': {
        const w = 0.42 * r
        const lift = (0.14 + 0.12 * intensity) * r
        return `M${mx - w * 0.3},${my} q${w * 0.5},${lift} ${w},${-lift * 0.4}`
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
    // Tapered ribbon: offset each point perpendicular to the local direction,
    // width easing from rootW to tipW; polygon = up-side then back down. Widths
    // read as the legacy cape's flag silhouette, not a string.
    const rootW = 10.5
    const tipW = 5
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

  return {
    render(solved, face: FaceAux = NEUTRAL_FACE, overrides?, extras?): void {

      // Squash pivot: the figure's ground point (root x, lowest extent).
      let groundY = -Infinity
      for (const b of solved.bones) if (b.ey > groundY) groundY = b.ey
      const root = solved.bones[rootIndex]
      const rootX = root ? root.ox : 0
      const fl = extras?.flourish
      if (fl && (Math.abs(fl.sx - 1) > 0.004 || Math.abs(fl.sy - 1) > 0.004)) {
        group.style.transform = `translate(${rootX}px, ${groundY}px) scale(${fl.sx}, ${fl.sy}) translate(${-rootX}px, ${-groundY}px)`
      } else if (group.style.transform) {
        group.style.transform = ''
      }

      // Accessory ribbons.
      const accs = extras?.accessories ?? []
      for (let i = 0; i < accs.length; i++) ensureRibbon(i).setAttribute('d', ribbonD(accs[i]))
      for (let i = accs.length; i < ribbons.length; i++) ribbons[i].setAttribute('d', 'M0,0')

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

      // Head + face.
      const head = bone(solved, HEAD_JOINT_ID)
      if (head && headEl && faceGroup) {
        const hx = overrides?.[HEAD_JOINT_ID]?.ex ?? head.ex
        const hy = overrides?.[HEAD_JOINT_ID]?.ey ?? head.ey
        headEl.setAttribute('cx', String(hx))
        headEl.setAttribute('cy', String(hy))
        const rot = head.worldAngle + Math.PI / 2
        faceGroup.style.transform = `translate(${hx}px, ${hy}px) rotate(${rot}rad)`

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
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? -1 : 1
          const ex = (EYE_FACING * facing + EYE_SEP * side) * headR + dx
          const ey = EYE_Y * headR + dy
          pupils[i].setAttribute('cx', String(ex))
          pupils[i].setAttribute('cy', String(ey))
          pupils[i].setAttribute('ry', String(PUPIL_R * headR * openY))
          brows[i].setAttribute('d', browD(side as -1 | 1, face.brow ?? 'determined', intensity, facing))
        }
        if (mouthEl) mouthEl.setAttribute('d', mouthD(face.mouth ?? 'smile', intensity, facing))
      }
    },
    destroy(): void {
      group.remove()
      pupils = []
      brows = []
      mouthEl = null
    },
  }
}
