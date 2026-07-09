import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { SKETCH_RADII, type ElementDoc, type HeadingElement, type PageDoc, type PanelDoc, type PlaceDoc, type TextElement } from './doc/docTypes'
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

function placeStyle(place?: PlaceDoc): CSSProperties {
  return place ? { position: 'absolute', ...place } : {}
}

function textChildren(text: string): ReactNode {
  const lines = text.split('\n')
  return lines.map((line, index) => (
    index === 0 ? line : <span key={index}><br />{line}</span>
  ))
}

function headingMarginBottom(panel: PanelDoc, index: number, element: HeadingElement): string | undefined {
  if (panel.layout === 'flow') return undefined
  const next = panel.elements[index + 1]
  if (!next) return undefined
  if (next.type === 'checklist') return "10px"
  if (next.type === 'custom' && next.component === 'howToRead') return "8px"
  if (next.type === 'custom' && next.component === 'toolbelt') return "8px"
  if (element.text === 'THE VAULT') return "6px"
  return undefined
}

function renderHeading(element: HeadingElement, panel: PanelDoc, index: number) {
  const baseStyle: CSSProperties = {
    ...placeStyle(element.place),
    fontFamily: "'Permanent Marker',cursive",
    fontSize: `${element.size}px`,
  }
  const marginBottom = headingMarginBottom(panel, index, element)
  if (marginBottom) baseStyle.marginBottom = marginBottom
  if (element.rotate !== undefined) baseStyle.transform = `rotate(${element.rotate}deg)`
  if (element.prefix) baseStyle.lineHeight = "1.1"

  if (element.highlight) {
    const color = element.highlight === 'yellow' && element.prefix ? 'rgba(255,210,63,.75)' : HIGHLIGHTS[element.highlight]
    const padding = element.size >= 50 ? "0 10px" : "0 6px"
    return (
      <div style={baseStyle}>
        {element.prefix ? `${element.prefix} ` : null}<span style={{ background: `linear-gradient(105deg, transparent 3%, ${color} 5%, ${color} 96%, transparent 98%)`, padding }}>{element.text}</span>
      </div>
    )
  }

  if (element.suffix) {
    return (
      <div style={baseStyle}>{element.text} <span style={{ fontFamily: "'Caveat',cursive", fontSize: element.text === 'FUN FACTS' ? "15px" : "16px", color: "#8a8378" }}>{element.suffix}</span></div>
    )
  }

  return <div style={baseStyle}>{element.text}</div>
}

function renderText(element: TextElement, panel: PanelDoc, index: number) {
  const style: CSSProperties = {
    ...placeStyle(element.place),
    fontSize: `${element.size}px`,
  }
  if (element.tone === 'muted' && element.size >= 24) style.fontFamily = "'Caveat',cursive"
  if (element.tone === 'muted') style.color = "#5a544a"
  if (element.tone === 'faint') style.color = "#8a8378"
  if (element.lineHeight !== undefined) style.lineHeight = String(element.lineHeight)
  const previous = panel.elements[index - 1]
  if (panel.layout !== 'flow' && previous?.type === 'heading' && previous.text === 'THE END?') style.marginTop = "8px"
  return <div style={style}>{textChildren(element.text)}</div>
}

function renderElement(element: ElementDoc, panel: PanelDoc, index: number, flags: Record<string, boolean>) {
  if (element.showIfFlag && !flags[element.showIfFlag]) return null

  if (element.type === 'heading') return renderHeading(element, panel, index)
  if (element.type === 'text') return renderText(element, panel, index)
  if (element.type === 'caption') {
    return <div style={{ ...placeStyle(element.place), fontFamily: "'Caveat',cursive", fontSize: `${element.size ?? 16}px`, color: "#8a8378" }}>{element.text}</div>
  }
  if (element.type === 'note') {
    return <div style={{ ...placeStyle(element.place), boxSizing: "border-box", border: "2.5px solid #1a1a1a", borderRadius: "12px 3px 10px 4px", background: "#fdfbf3", padding: "12px 14px", fontSize: `${element.size ?? 16}px`, lineHeight: element.lineHeight !== undefined ? String(element.lineHeight) : undefined }}>{textChildren(element.text)}</div>
  }
  if (element.type === 'placeholder') {
    return <div style={{ ...placeStyle(element.place), flex: element.grow ? "1" : undefined, border: "2.5px dashed rgba(26,26,26,.45)", borderRadius: "8px", background: "repeating-linear-gradient(45deg, rgba(26,26,26,.05) 0px, rgba(26,26,26,.05) 12px, transparent 12px, transparent 24px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace,monospace", fontSize: "12px", color: "#6a6458" }}>{element.text}</div>
  }
  if (element.type === 'checklist') {
    return (
      <div style={{ ...placeStyle(element.place), display: "flex", flexDirection: "column", gap: `${element.gap ?? 9}px`, fontSize: `${element.size ?? 16}px`, lineHeight: String(element.lineHeight ?? 1.3) }}>
        {element.items.map((item) => (
          <div key={item}>✓ {item}</div>
        ))}
      </div>
    )
  }

  const Component = REGISTRY[element.component]
  if (!Component) {
    return <div style={{ ...placeStyle(element.place), border: "2.5px dashed rgba(26,26,26,.45)", borderRadius: "8px", padding: "10px", fontFamily: "ui-monospace,monospace", fontSize: "12px", color: "#6a6458" }}>unknown custom: {element.component}</div>
  }
  return <Component props={element.props} />
}

function renderPanel(panel: PanelDoc, panelIndex: number, flags: Record<string, boolean>) {
  const style: CSSProperties = {
    position: "absolute",
    left: `${panel.x}px`,
    top: `${panel.y}px`,
    width: `${panel.w}px`,
    height: `${panel.h}px`,
    boxSizing: "border-box",
    background: "#fffdf6",
    border: "3.5px solid #1a1a1a",
    borderRadius: SKETCH_RADII[panel.sketch ?? 'a'],
    transform: `rotate(${panel.rotate ?? 0}deg)`,
    padding: panel.padding,
  }
  if (panel.layout === 'flow') {
    style.display = "flex"
    style.flexDirection = "column"
    style.gap = `${panel.gap ?? 0}px`
  }

  return (
    <div key={panelIndex} style={style}>
      {panel.elements.map((element, elementIndex) => (
        <Fragment key={elementIndex}>{renderElement(element, panel, elementIndex, flags)}</Fragment>
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
