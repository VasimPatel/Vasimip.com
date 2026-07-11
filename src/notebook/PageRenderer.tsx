import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { SKETCH_RADII, type ArtBox, type BoxDoc, type DrawBox, type FamKind, type PageDoc, type PanelDoc, type TextBox } from './doc/docTypes'
import { REGISTRY } from './registry'

interface PageRendererProps {
  page: PageDoc
  style: CSSProperties
  flags: Record<string, boolean>
}

const HIGHLIGHTS = {
  yellow: 'rgba(255,210,63,.7)',
  pink: 'rgba(255,92,168,.55)',
} as const

const FONT_FAMILY: Record<FamKind, string> = {
  hand: "'Patrick Hand',cursive",
  marker: "'Permanent Marker',cursive",
  caveat: "'Caveat',cursive",
}

/** Line-height per family, shared with the migration's vertical-metrics estimate. */
const LINE_HEIGHT: Record<FamKind, number> = { hand: 1.4, marker: 1.05, caveat: 1.2 }

function boxFrame(box: BoxDoc): CSSProperties {
  const style: CSSProperties = {
    position: 'absolute',
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.w}px`,
  }
  if (box.rot !== undefined) style.transform = `rotate(${box.rot}deg)`
  return style
}

/** Text with '\n' honoured (whitespace: pre-line) and, where `charRots` supplies a
 *  number, that char tilted in its own inline-block span (plain runs otherwise). */
function textContent(text: string, charRots?: (number | null)[]): ReactNode {
  if (!charRots || charRots.length === 0) return text
  const out: ReactNode[] = []
  let run = ''
  let ci = 0 // non-space char index
  const flush = () => { if (run) { out.push(<Fragment key={out.length}>{run}</Fragment>); run = '' } }
  for (const ch of text) {
    if (/\S/.test(ch)) {
      const rot = charRots[ci]
      ci++
      if (typeof rot === 'number') {
        flush()
        out.push(<span key={out.length} style={{ display: 'inline-block', transform: `rotate(${rot}deg)` }}>{ch}</span>)
        continue
      }
    }
    run += ch
  }
  flush()
  return out
}

function TextBoxR({ box }: { box: TextBox }) {
  const fam = box.fam ?? 'hand'
  const style: CSSProperties = {
    ...boxFrame(box),
    fontFamily: FONT_FAMILY[fam],
    fontSize: `${box.size ?? 16}px`,
    lineHeight: String(LINE_HEIGHT[fam]),
    whiteSpace: 'pre-line',
  }
  if (box.color) style.color = box.color

  const inner = textContent(box.text, box.charRots)

  if (box.note) {
    return (
      <div style={{ ...style, boxSizing: 'border-box', border: '2.5px solid #1a1a1a', borderRadius: '12px 3px 10px 4px', background: '#fdfbf3', padding: '12px 14px' }}>
        {inner}
      </div>
    )
  }

  if (box.hl) {
    const color = HIGHLIGHTS[box.hl]
    const padding = (box.size ?? 16) >= 50 ? '0 10px' : '0 6px'
    return (
      <div style={style}>
        <span style={{ background: `linear-gradient(105deg, transparent 3%, ${color} 5%, ${color} 96%, transparent 98%)`, padding }}>{inner}</span>
      </div>
    )
  }

  return <div style={style}>{inner}</div>
}

function DrawBoxR({ box }: { box: DrawBox }) {
  return (
    <svg
      style={{ position: 'absolute', left: `${box.x}px`, top: `${box.y}px`, transform: box.rot !== undefined ? `rotate(${box.rot}deg)` : undefined, overflow: 'visible', pointerEvents: 'none' }}
      width={box.w}
      height={box.h}
    >
      {box.strokes.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={box.strokeColor ?? '#1a1a1a'} strokeWidth={box.strokeW ?? 3} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

function ArtBoxR({ box }: { box: ArtBox }) {
  const frame: CSSProperties = {
    position: 'absolute',
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.w}px`,
    height: `${box.h}px`,
    transform: box.rot !== undefined ? `rotate(${box.rot}deg)` : undefined,
  }
  const Component = REGISTRY[box.component]
  if (!Component) {
    return <div style={{ ...frame, border: '2.5px dashed rgba(26,26,26,.45)', borderRadius: '8px', padding: '10px', fontFamily: 'ui-monospace,monospace', fontSize: '12px', color: '#6a6458' }}>unknown art: {box.component}</div>
  }
  return <div style={frame}><Component props={box.props} /></div>
}

function renderBox(box: BoxDoc, flags: Record<string, boolean>) {
  if (box.showIfFlag && !flags[box.showIfFlag]) return null
  if (box.kind === 'text') return <TextBoxR box={box} />
  if (box.kind === 'draw') return <DrawBoxR box={box} />
  return <ArtBoxR box={box} />
}

function renderPanel(panel: PanelDoc, panelIndex: number, flags: Record<string, boolean>) {
  const style: CSSProperties = {
    position: 'absolute',
    left: `${panel.x}px`,
    top: `${panel.y}px`,
    width: `${panel.w}px`,
    height: `${panel.h}px`,
    boxSizing: 'border-box',
    background: '#fffdf6',
    border: '3.5px solid #1a1a1a',
    borderRadius: SKETCH_RADII[panel.sketch ?? 'a'],
    transform: `rotate(${panel.rotate ?? 0}deg)`,
  }

  return (
    <div key={panelIndex} style={style}>
      {panel.boxes.map((box, boxIndex) => (
        <Fragment key={boxIndex}>{renderBox(box, flags)}</Fragment>
      ))}
    </div>
  )
}

export default function PageRenderer({ page, style, flags }: PageRendererProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...style }}>
      <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", boxSizing: "border-box", backgroundColor: "#fdfbf3", backgroundImage: "linear-gradient(90deg, transparent 58px, rgba(224,96,96,.5) 58px, rgba(224,96,96,.5) 60px, transparent 60px), repeating-linear-gradient(transparent 0px, transparent 26px, rgba(122,168,204,.38) 26px, rgba(122,168,204,.38) 27.5px)", border: "2.5px solid #26241f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.28)" }}>
        {page.panels.map((panel, panelIndex) => renderPanel(panel, panelIndex, flags))}
      </div>
      <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#f3edd9", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
    </div>
  )
}
