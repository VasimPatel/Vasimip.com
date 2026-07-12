// @dash/renderer-svg — the DOM writer. The character drawing (charm edition —
// legacy visual language: limb polylines, dark-pupil face with brows/mouth,
// bandana ribbon, squash & stretch) lives in character.ts; props/ropes for the
// dev harness below.

const SVG_NS = 'http://www.w3.org/2000/svg'

export { createCharacterRenderer } from './character'
export type { CharacterRenderer, EndpointOverrides, RenderExtras } from './character'

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
