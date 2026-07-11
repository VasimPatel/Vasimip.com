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

export interface CharacterRenderer {
  /** Update all bone/head geometry from a freshly solved skeleton. `face` drives
   * the pupils + lids; omitting it renders a neutral (open, centred) face, so P2/P3
   * callers are unaffected. */
  render(solved: SolvedSkeleton, face?: FaceAux): void
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
    render(solved: SolvedSkeleton, face: FaceAux = NEUTRAL_FACE): void {
      for (const bone of solved.bones) {
        if (bone.id === HEAD_JOINT_ID) {
          if (headEl) {
            headEl.setAttribute('cx', String(bone.ex))
            headEl.setAttribute('cy', String(bone.ey))
          }
          if (faceGroup) {
            // Head centre = bone end; orient the face with the head bone (which
            // points "up" the head, ≈ −π/2 at rest, so +π/2 makes rest upright).
            const rot = bone.worldAngle + Math.PI / 2
            faceGroup.style.transform = `translate(${bone.ex}px, ${bone.ey}px) rotate(${rot}rad)`
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
        line.setAttribute('x2', String(bone.ex))
        line.setAttribute('y2', String(bone.ey))
      }
    },
    destroy(): void {
      group.remove()
      eyes = []
    },
  }
}
