/**
 * One depth's DOM — a stable, viewport-centered panel (NOT part of a scroll
 * column, so the text never drifts out of alignment). useDescentDom drives its
 * opacity + plunge transform from the descent `position`, so the active depth's
 * words sit centered over the lit page and the others plunge away. Real semantic
 * <section> with a heading, kept in the DOM for a11y/SEO.
 */
import type { ReactNode } from 'react'
import type { DepthDef } from '@/lib/depths'

interface DepthSectionProps {
  depth: DepthDef
  index: number
  children?: ReactNode
}

export function DepthSection({ depth, index, children }: DepthSectionProps) {
  return (
    <section className="depth" data-index={index} id={depth.id} aria-labelledby={`${depth.id}-title`}>
      <div className="depth-inner">
        <p className="marginalia depth-roman">
          {depth.roman} · {depth.facet}
        </p>
        <h2 className="display depth-title" id={`${depth.id}-title`}>
          {depth.title}
        </h2>
        {children}
      </div>
    </section>
  )
}
