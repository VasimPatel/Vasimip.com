// WYSIWYG page canvas. Renders the REAL PageRenderer (or CoverRenderer for the
// cover) at 920×660, scaled to fit, with an interactive overlay of selectable /
// draggable / resizable panel rects + a draggable Dash-anchor marker. All
// geometry edits round to integers and snap to an 8px grid (hold Alt to disable).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import PageRenderer from '../notebook/PageRenderer'
import CoverRenderer from '../notebook/CoverRenderer'
import type { CoverDoc, PageDoc, PanelDoc } from '../notebook/doc/docTypes'
import { STAGE_W, STAGE_H, round, snap } from './shared'

type ResizeMode = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type DragMode = 'move' | 'anchor' | ResizeMode

interface Props {
  page: PageDoc | null // null → cover selected
  cover: CoverDoc
  flags: Record<string, boolean>
  selected: number | null
  onSelect: (i: number | null) => void
  updatePanel: (i: number, fn: (p: PanelDoc) => PanelDoc) => void
  addPanel: (p: PanelDoc) => void
  deletePanel: (i: number) => void
}

const MIN_W = 60
const MIN_H = 60

function applyDrag(mode: DragMode, start: PanelDoc, dx: number, dy: number, snapOn: boolean): Partial<PanelDoc> {
  const q = (n: number) => (snapOn ? snap(n) : round(n))
  switch (mode) {
    case 'move': return { x: q(start.x + dx), y: q(start.y + dy) }
    case 'anchor': return { anchor: { dx: q(start.anchor.dx + dx), dy: q(start.anchor.dy + dy) } }
    case 'e': return { w: Math.max(MIN_W, q(start.w + dx)) }
    case 's': return { h: Math.max(MIN_H, q(start.h + dy)) }
    case 'w': { const w = Math.max(MIN_W, q(start.w - dx)); return { x: q(start.x + (start.w - w)), w } }
    case 'n': { const h = Math.max(MIN_H, q(start.h - dy)); return { y: q(start.y + (start.h - h)), h } }
    case 'ne': return { ...applyDrag('n', start, dx, dy, snapOn), ...applyDrag('e', start, dx, dy, snapOn) }
    case 'nw': return { ...applyDrag('n', start, dx, dy, snapOn), ...applyDrag('w', start, dx, dy, snapOn) }
    case 'se': return { ...applyDrag('s', start, dx, dy, snapOn), ...applyDrag('e', start, dx, dy, snapOn) }
    case 'sw': return { ...applyDrag('s', start, dx, dy, snapOn), ...applyDrag('w', start, dx, dy, snapOn) }
  }
}

const HANDLES: { mode: ResizeMode; style: CSSProperties; cursor: string }[] = [
  { mode: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { mode: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { mode: 'ne', style: { right: 0, top: 0 }, cursor: 'nesw-resize' },
  { mode: 'e', style: { right: 0, top: '50%' }, cursor: 'ew-resize' },
  { mode: 'se', style: { right: 0, bottom: 0 }, cursor: 'nwse-resize' },
  { mode: 's', style: { left: '50%', bottom: 0 }, cursor: 'ns-resize' },
  { mode: 'sw', style: { left: 0, bottom: 0 }, cursor: 'nesw-resize' },
  { mode: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
]

export default function PageCanvas({ page, cover, flags, selected, onSelect, updatePanel, addPanel, deletePanel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const recompute = () => {
      const pad = 40
      const s = Math.min((wrap.clientWidth - pad) / STAGE_W, (wrap.clientHeight - pad) / STAGE_H, 1)
      setScale(Math.max(0.1, s))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const beginDrag = useCallback((e: React.MouseEvent, mode: DragMode, i: number) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(i)
    const s = scaleRef.current
    const sx = e.clientX
    const sy = e.clientY
    let start: PanelDoc | null = null
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      updatePanel(i, (p) => {
        if (!start) start = p
        return { ...p, ...applyDrag(mode, start, dx, dy, !ev.altKey) }
      })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [onSelect, updatePanel])

  // Arrow-key nudge / Delete on the selected panel (ignored while typing in a form).
  useEffect(() => {
    if (selected == null || !page) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const step = e.shiftKey ? 8 : 1
      if (e.key === 'ArrowLeft') { e.preventDefault(); updatePanel(selected, (p) => ({ ...p, x: p.x - step })) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); updatePanel(selected, (p) => ({ ...p, x: p.x + step })) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); updatePanel(selected, (p) => ({ ...p, y: p.y - step })) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); updatePanel(selected, (p) => ({ ...p, y: p.y + step })) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && page.panels.length > 1) {
        e.preventDefault()
        if (window.confirm('Delete panel ' + (selected + 1) + '?')) deletePanel(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, page, updatePanel, deletePanel])

  const onStageDoubleClick = (e: React.MouseEvent) => {
    if (!page) return
    const stage = stageRef.current
    if (!stage || e.target !== e.currentTarget) return
    const rect = stage.getBoundingClientRect()
    const x = round(((e.clientX - rect.left) / scale) - 100)
    const y = round((e.clientY - rect.top) / scale)
    addPanel({
      x: Math.max(0, x), y: Math.max(0, y), w: 200, h: 160,
      anchor: { dx: 100, dy: 0 },
      elements: [{ type: 'heading', text: 'NEW PANEL', size: 20 }],
    })
  }

  const stageStyle: CSSProperties = { position: 'relative', width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }
  const flat: CSSProperties = { transform: 'none', transition: 'none' }

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="stage-sizer" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        <div className="stage" style={stageStyle}>
          {page
            ? <PageRenderer page={page} style={flat} flags={flags} />
            : <CoverRenderer cover={cover} style={flat} onOpen={() => {}} />}

          {page && (
            <div className="overlay" onDoubleClick={onStageDoubleClick} ref={stageRef}>
              {page.panels.map((p, i) => {
                const sel = i === selected
                return (
                  <div
                    key={i}
                    data-testid={`panel-rect-${i}`}
                    className={`prect${sel ? ' sel' : ''}`}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h, transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined }}
                    onMouseDown={(e) => beginDrag(e, 'move', i)}
                  >
                    {sel && <div className="dims">{p.w}×{p.h} @ {p.x},{p.y}</div>}
                    {sel && HANDLES.map((h) => (
                      <div
                        key={h.mode}
                        className="handle"
                        style={{ ...h.style, cursor: h.cursor }}
                        onMouseDown={(e) => beginDrag(e, h.mode, i)}
                      />
                    ))}
                  </div>
                )
              })}
              {/* Anchor markers drawn after rects so they stay clickable on top. */}
              {page.panels.map((p, i) => (
                i === selected && (
                  <div
                    key={`a${i}`}
                    className="anchor"
                    style={{ left: p.x + p.anchor.dx, top: p.y + p.anchor.dy }}
                    title={`Dash anchor (ax ${p.x + p.anchor.dx}, ay ${p.y + p.anchor.dy})`}
                    onMouseDown={(e) => beginDrag(e, 'anchor', i)}
                  >⌖</div>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
