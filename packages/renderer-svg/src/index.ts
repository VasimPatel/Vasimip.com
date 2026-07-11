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
import type { SolvedSkeleton } from '@dash/engine'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HEAD_JOINT_ID = 'head'
const DEFAULT_COLOR = '#1a1a1a'
const DEFAULT_WIDTH = 5
const DEFAULT_HEAD_FILL = '#fffdf6'

export interface CharacterRenderer {
  /** Update all bone/head geometry from a freshly solved skeleton. */
  render(solved: SolvedSkeleton): void
  /** Remove every element this renderer created from the SVG root. */
  destroy(): void
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
      group.appendChild(circle)
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
    render(solved: SolvedSkeleton): void {
      for (const bone of solved.bones) {
        if (bone.id === HEAD_JOINT_ID) {
          if (headEl) {
            headEl.setAttribute('cx', String(bone.ex))
            headEl.setAttribute('cy', String(bone.ey))
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
    },
  }
}
