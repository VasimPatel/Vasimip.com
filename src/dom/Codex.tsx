/**
 * The codex's DOM — five stable, viewport-centered depth panels stacked in one
 * fixed stage. useDescentDom fades + plunges them by the descent position so one
 * depth is current at a time. Every depth's prose is real DOM (a11y/SEO); the
 * torch only changes how much is painted.
 */
import { DEPTH_LIST } from '@/lib/depths'
import { CONTENT, type Block } from '@/content/depths'
import { DepthSection } from './DepthSection'
import { JourneyReflection } from './JourneyReflection'

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'lead':
      return <p className="lead reveal">{block.text}</p>
    case 'p':
      return <p className="reveal">{block.text}</p>
    case 'margin':
      return <p className="marginalia codex-margin reveal">{block.text}</p>
    case 'aside':
      return (
        <aside className="illumination reveal" data-tight="" data-illumination={block.id}>
          {block.text}
        </aside>
      )
    case 'link':
      return (
        <a className="codex-link reveal" href={block.href}>
          {block.label ? <span className="codex-link-label">{block.label}</span> : null}
          {block.text}
        </a>
      )
  }
}

export function Codex() {
  return (
    <main className="codex-stage" id="codex">
      <h1 className="sr-only">The Codex</h1>
      {DEPTH_LIST.map((depth, i) => {
        const content = CONTENT[depth.id]
        return (
          <DepthSection key={depth.id} depth={depth} index={i}>
            {content.epigraph ? <p className="epigraph">{content.epigraph}</p> : null}
            {content.blocks.map((block, j) => (
              <BlockView key={j} block={block} />
            ))}
            {depth.id === 'arrival' ? <JourneyReflection /> : null}
          </DepthSection>
        )
      })}
    </main>
  )
}
