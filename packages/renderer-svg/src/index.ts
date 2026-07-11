// @dash/renderer-svg — the DOM writer. Turns a SolvedSkeleton (world-space bones
// from packages/engine's FK) into SVG. It creates elements ONCE, then render()
// only updates geometry attributes — the direct-endpoint-write path the Phase 0
// spike recommended (no transforms on bones, so the linecap × non-uniform-scale
// trap never applies; explicit base geometry attributes are still set at create).
//
// Convention: the joint whose id is 'head' is drawn as a <circle> whose radius is
// that bone's (scaled) length — its center is the bone END, so the circle passes
// through the neck point, matching the legacy figure. Every other joint is a <line>
// written x1/y1 (origin) → x2/y2 (end). Stroke color/width/linecap come from the
// CharacterDoc style; head fill from palette.head. This keeps the head special-case
// a renderer convention, adding no schema field.

import type { CharacterDoc, RigTemplate } from '@dash/schema'
import type { FaceAux, SolvedSkeleton } from '@dash/engine'
import { NEUTRAL_FACE } from '@dash/engine'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HEAD_JOINT_ID = 'head'
const DEFAULT_COLOR = '#1a1a1a'
const DEFAULT_WIDTH = 5
const DEFAULT_HEAD_FILL = '#fffdf6'

// Eye convention (renderer extension, NOT schema — mirrors the legacy Dash face):
// two eyes sit on the head circle, each a white with a dark pupil that tracks the
// look-at aux offset (clamped inside the white), and lids that squash the eye to a
// line on a blink. Geometry is expressed in head RADII so it scales with the rig.
const EYE_OFFSET_X = 0.34 // ± from head centre, in head radii
const EYE_OFFSET_Y = -0.12 // above centre, in head radii (SVG y-down)
const EYE_WHITE_R = 0.26 // in head radii
const PUPIL_R = 0.15 // in head radii
const EYE_STROKE_W = 0.9

/** Optional per-bone endpoint overrides (P5 secondary): boneId → the world-space END
 * to draw that bone to, INSTEAD of its FK end. The origin is unchanged, so a hard
 * length-locked verlet end reads as angular follow-through. Backward-compatible:
 * omit it and rendering is exactly the FK result. */
export type EndpointOverrides = Record<string, { ex: number; ey: number }>

export interface CharacterRenderer {
  /** Update all bone/head geometry from a freshly solved skeleton. `face` drives
   * the pupils + lids; omitting it renders a neutral (open, centred) face, so P2/P3
   * callers are unaffected. `overrides` redraws named bones to a verlet endpoint
   * (P5 secondary); omitting it is the plain FK render (P2–P4 callers unaffected). */
  render(solved: SolvedSkeleton, face?: FaceAux, overrides?: EndpointOverrides): void
  /** Remove every element this renderer created from the SVG root. */
  destroy(): void
}

interface EyeEl {
  white: SVGEllipseElement
  pupil: SVGEllipseElement
  /** Local centre offset (in px) from the head centre, in the head's rest frame. */
  ox: number
  oy: number
}

interface BoneEl {
  id: string
  line: SVGLineElement
}

export function createCharacterRenderer(
  svgRoot: SVGSVGElement,
  character: CharacterDoc,
  rig: RigTemplate,
): CharacterRenderer {
  const color = character.style?.color ?? DEFAULT_COLOR
  const width = character.style?.width ?? DEFAULT_WIDTH
  const linecap = character.style?.linecap ?? 'round'
  const headFill = character.palette?.head ?? DEFAULT_HEAD_FILL
  const props = character.proportions

  // One group holds everything so destroy() is a single removeChild and the
  // renderer never disturbs sibling content in the SVG.
  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('data-dash-renderer', character.id)

  const bones: BoneEl[] = []
  let headEl: SVGCircleElement | null = null
  let headR = 0
  let faceGroup: SVGGElement | null = null
  let eyes: EyeEl[] = []

  // Append in RIG-JOINT ORDER so the head (typically early in the tree) sits
  // behind later limbs — a raised arm or a hand-to-chin forearm draws ON TOP of
  // the opaque head, matching the legacy pose components' paint order.
  for (const joint of rig.joints) {
    if (joint.id === HEAD_JOINT_ID) {
      const circle = document.createElementNS(SVG_NS, 'circle')
      const r = joint.length * (props?.[joint.id] ?? 1)
      // Explicit base geometry (spike finding: createElementNS defaults to 0).
      circle.setAttribute('cx', '0')
      circle.setAttribute('cy', '0')
      circle.setAttribute('r', String(r))
      circle.setAttribute('fill', headFill)
      circle.setAttribute('stroke', color)
      circle.setAttribute('stroke-width', String(width))
      headEl = circle
      headR = r
      group.appendChild(circle)

      // Face group (eyes) — drawn on top of the head circle; positioned/rotated
      // per-render via a CSS transform (spike guidance: transformed groups use CSS
      // transform, which accepts explicit units incl. rad).
      const fg = document.createElementNS(SVG_NS, 'g') as SVGGElement
      const eyeStroke = Math.max(0.4, EYE_STROKE_W * (r / 14))
      for (const side of [-1, 1] as const) {
        const white = document.createElementNS(SVG_NS, 'ellipse')
        white.setAttribute('cx', String(side * EYE_OFFSET_X * r))
        white.setAttribute('cy', String(EYE_OFFSET_Y * r))
        white.setAttribute('rx', String(EYE_WHITE_R * r))
        white.setAttribute('ry', String(EYE_WHITE_R * r))
        white.setAttribute('fill', '#ffffff')
        white.setAttribute('stroke', color)
        white.setAttribute('stroke-width', String(eyeStroke))
        const pupil = document.createElementNS(SVG_NS, 'ellipse')
        pupil.setAttribute('cx', String(side * EYE_OFFSET_X * r))
        pupil.setAttribute('cy', String(EYE_OFFSET_Y * r))
        pupil.setAttribute('rx', String(PUPIL_R * r))
        pupil.setAttribute('ry', String(PUPIL_R * r))
        pupil.setAttribute('fill', color)
        fg.appendChild(white)
        fg.appendChild(pupil)
        eyes.push({ white, pupil, ox: side * EYE_OFFSET_X * r, oy: EYE_OFFSET_Y * r })
      }
      faceGroup = fg
      group.appendChild(fg)
      continue
    }
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', '0')
    line.setAttribute('y1', '0')
    line.setAttribute('x2', '0')
    line.setAttribute('y2', '0')
    line.setAttribute('stroke', color)
    line.setAttribute('stroke-width', String(width))
    line.setAttribute('stroke-linecap', linecap)
    group.appendChild(line)
    bones.push({ id: joint.id, line })
  }

  svgRoot.appendChild(group)

  // Index solved bones by id each render (small, cheap) so render() tolerates any
  // bone ordering; element refs are captured once above.
  const lineById = new Map<string, SVGLineElement>()
  for (const b of bones) lineById.set(b.id, b.line)

  return {
    render(solved: SolvedSkeleton, face: FaceAux = NEUTRAL_FACE, overrides?: EndpointOverrides): void {
      for (const bone of solved.bones) {
        const ov = overrides?.[bone.id]
        const ex = ov ? ov.ex : bone.ex
        const ey = ov ? ov.ey : bone.ey
        if (bone.id === HEAD_JOINT_ID) {
          if (headEl) {
            headEl.setAttribute('cx', String(ex))
            headEl.setAttribute('cy', String(ey))
          }
          if (faceGroup) {
            // Head centre = bone end; orient the face with the head bone (which
            // points "up" the head, ≈ −π/2 at rest, so +π/2 makes rest upright).
            const rot = bone.worldAngle + Math.PI / 2
            faceGroup.style.transform = `translate(${ex}px, ${ey}px) rotate(${rot}rad)`
            const openY = 1 - Math.min(1, Math.max(0, face.blink))
            const maxOff = Math.max(0, (EYE_WHITE_R - PUPIL_R) * headR)
            let dx = face.pupilDx
            let dy = face.pupilDy
            const len = Math.hypot(dx, dy)
            if (len > maxOff && len > 0) {
              dx = (dx / len) * maxOff
              dy = (dy / len) * maxOff
            }
            for (const eye of eyes) {
              eye.white.setAttribute('ry', String(EYE_WHITE_R * headR * openY))
              eye.pupil.setAttribute('cx', String(eye.ox + dx))
              eye.pupil.setAttribute('cy', String(eye.oy + dy))
              eye.pupil.setAttribute('ry', String(PUPIL_R * headR * openY))
            }
          }
          continue
        }
        const line = lineById.get(bone.id)
        if (!line) continue
        line.setAttribute('x1', String(bone.ox))
        line.setAttribute('y1', String(bone.oy))
        line.setAttribute('x2', String(ex))
        line.setAttribute('y2', String(ey))
      }
    },
    destroy(): void {
      group.remove()
      eyes = []
    },
  }
}

// ── P5 prop + rope drawing (dev-harness layer) ───────────────────────────────────
// Minimal SVG for the shared verlet solver's props and ropes, used by the physics
// review harness. Production panel content stays render-layer (PageRenderer/site is
// untouched — nothing there imports these). A prop is a rect drawn from a particle
// PAIR (midpoint = centre, angle = atan2 of the pair) via CSS transform (spike
// guidance: transformed groups use CSS transform). A rope is a <polyline> through the
// sampled chain points.

export interface PropRenderer {
  /** a/b are the two prop particle world positions (verlet.particle(id)). */
  render(a: { x: number; y: number }, b: { x: number; y: number }, asleep?: boolean): void
  destroy(): void
}

export function createPropRenderer(
  svgRoot: SVGSVGElement,
  spec: { w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number },
): PropRenderer {
  const g = document.createElementNS(SVG_NS, 'g')
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(-spec.w / 2))
  rect.setAttribute('y', String(-spec.h / 2))
  rect.setAttribute('width', String(spec.w))
  rect.setAttribute('height', String(spec.h))
  rect.setAttribute('rx', '2')
  rect.setAttribute('fill', spec.fill ?? '#ffd8a8')
  rect.setAttribute('stroke', spec.stroke ?? '#1a1a1a')
  rect.setAttribute('stroke-width', String(spec.strokeWidth ?? 2))
  g.appendChild(rect)
  // Sleep indicator dot — filled when awake, hollow when asleep.
  const dot = document.createElementNS(SVG_NS, 'circle')
  dot.setAttribute('cx', '0')
  dot.setAttribute('cy', String(-spec.h / 2 - 6))
  dot.setAttribute('r', '2.4')
  g.appendChild(dot)
  svgRoot.appendChild(g)
  return {
    render(a, b, asleep = false): void {
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const rot = Math.atan2(b.y - a.y, b.x - a.x)
      g.style.transform = `translate(${cx}px, ${cy}px) rotate(${rot}rad)`
      dot.setAttribute('fill', asleep ? 'none' : '#2f9e44')
      dot.setAttribute('stroke', asleep ? '#adb5bd' : 'none')
      dot.setAttribute('stroke-width', asleep ? '1' : '0')
    },
    destroy(): void {
      g.remove()
    },
  }
}

export interface RopeRenderer {
  render(points: ReadonlyArray<{ x: number; y: number }>): void
  destroy(): void
}

export function createRopeRenderer(
  svgRoot: SVGSVGElement,
  opts?: { stroke?: string; strokeWidth?: number },
): RopeRenderer {
  const poly = document.createElementNS(SVG_NS, 'polyline')
  poly.setAttribute('fill', 'none')
  poly.setAttribute('stroke', opts?.stroke ?? '#495057')
  poly.setAttribute('stroke-width', String(opts?.strokeWidth ?? 2.5))
  poly.setAttribute('stroke-linecap', 'round')
  poly.setAttribute('stroke-linejoin', 'round')
  svgRoot.appendChild(poly)
  return {
    render(points): void {
      let s = ''
      for (const p of points) s += `${p.x},${p.y} `
      poly.setAttribute('points', s.trim())
    },
    destroy(): void {
      poly.remove()
    },
  }
}
