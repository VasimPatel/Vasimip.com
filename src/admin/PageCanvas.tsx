// The whiteboard stage. Each panel is drawn natively (PageRenderer's panel
// wrapper style + the REAL box renderers for display parity) on a white
// 920×660 board scaled to fit, with an interactive overlay: panels drag/resize,
// boxes drag/resize inside their panel, ✏️ draw records pen strokes into a draw
// box, and a draggable mini-Dash marker sets the arrival anchor. Every geometry
// edit rounds to integers; panel moves snap to 8px (hold Alt to disable).
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { renderBox } from '../notebook/PageRenderer'
import CoverRenderer from '../notebook/CoverRenderer'
import { SKETCH_RADII, type CoverDoc, type DrawBox, type PageDoc, type PanelDoc } from '../notebook/doc/docTypes'
import { finishStroke, fitsBudget, type Pt } from '../notebook/doc/strokes'
import { STAGE_W, STAGE_H, round, snap } from './shared'

interface Props {
  page: PageDoc | null // null → cover selected
  cover: CoverDoc
  flags: Record<string, boolean>
  mode: 'move' | 'draw'
  gridOn: boolean
  selPanel: number | null
  selBox: number | null
  onSelectPanel: (i: number | null) => void
  onSelectBox: (pi: number, bi: number) => void
  onClear: () => void
  updatePanel: (i: number, fn: (p: PanelDoc) => PanelDoc) => void
  addPanel: (p: PanelDoc) => void
  deletePanel: (i: number) => void
}

const MIN_PW = 120
const MIN_PH = 90
const MIN_BW = 40
const MIN_BH = 24

// mini-Dash limb angles per arrival pose (mirrors the redesign mock).
const POSE_LIMBS: Record<string, { aL: number; aR: number; lL: number; lR: number }> = {
  none: { aL: 6, aR: -6, lL: 10, lR: -10 },
  cheer: { aL: 152, aR: -152, lL: 14, lR: -14 },
  think: { aL: 8, aR: -136, lL: 7, lR: -7 },
  fight: { aL: 64, aR: -72, lL: 30, lR: -12 },
  spray: { aL: 12, aR: -95, lL: 12, lR: -12 },
}

export default function PageCanvas({
  page, cover, flags, mode, gridOn, selPanel, selBox,
  onSelectPanel, onSelectBox, onClear, updatePanel, addPanel, deletePanel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const liveRefs = useRef<Record<string, SVGPathElement | null>>({})
  const [scale, setScale] = useState(0.6)
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const recompute = () => {
      const pad = 32
      const s = Math.min((wrap.clientWidth - pad) / STAGE_W, (wrap.clientHeight - pad) / STAGE_H, 1)
      setScale(Math.max(0.1, s))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // ── panel drag / resize ────────────────────────────────────────────────────
  const beginPanelDrag = useCallback((e: ReactPointerEvent, i: number, kind: 'move' | 'size') => {
    e.preventDefault()
    e.stopPropagation()
    onSelectPanel(i)
    const s = scaleRef.current
    const sx = e.clientX, sy = e.clientY
    let start: PanelDoc | null = null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      const snapOn = !ev.altKey
      const q = (n: number) => (snapOn && kind === 'move' ? snap(n) : round(n))
      updatePanel(i, (p) => {
        if (!start) start = p
        if (kind === 'move') {
          return {
            ...p,
            x: Math.max(0, Math.min(q(start.x + dx), STAGE_W - p.w)),
            y: Math.max(0, Math.min(q(start.y + dy), STAGE_H - p.h)),
          }
        }
        return {
          ...p,
          w: Math.max(MIN_PW, Math.min(q(start.w + dx), STAGE_W - p.x)),
          h: Math.max(MIN_PH, Math.min(q(start.h + dy), STAGE_H - p.y)),
        }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [onSelectPanel, updatePanel])

  // ── box drag / resize (clamped inside its panel) ───────────────────────────
  const beginBoxDrag = useCallback((e: ReactPointerEvent, pi: number, bi: number, kind: 'move' | 'size') => {
    e.preventDefault()
    e.stopPropagation()
    onSelectBox(pi, bi)
    const s = scaleRef.current
    const sx = e.clientX, sy = e.clientY
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      updatePanel(pi, (p) => {
        const box = p.boxes[bi]
        if (!box) return p
        const next = { ...box }
        if (kind === 'move') {
          next.x = Math.max(0, Math.min(round(box.x + dx), p.w - box.w))
          next.y = Math.max(0, Math.min(round(box.y + dy), p.h - box.h))
        } else {
          next.w = Math.max(MIN_BW, Math.min(round(box.w + dx), p.w - box.x))
          next.h = Math.max(MIN_BH, Math.min(round(box.h + dy), p.h - box.y))
        }
        return { ...p, boxes: p.boxes.map((b, j) => (j === bi ? next : b)) }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [onSelectBox, updatePanel])

  // ── pen: capture points, live-preview raw, commit SIMPLIFIED + SMOOTHED on
  // release (strokes.ts — same pipeline as the friend builder). A stroke that
  // would bust the box's ink budget is rejected whole with a brief tag; the
  // old code silently dropped the OLDEST strokes (submitter-reported loss). ──
  const [inkFullAt, setInkFullAt] = useState<{ pi: number; bi: number } | null>(null)
  const inkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const beginDraw = useCallback((e: ReactPointerEvent, pi: number, bi: number, strokesNow: readonly string[]) => {
    e.preventDefault()
    e.stopPropagation()
    onSelectBox(pi, bi)
    const surf = e.currentTarget as HTMLElement
    const rect = surf.getBoundingClientRect()
    const s = scaleRef.current
    const live = liveRefs.current[`${pi}-${bi}`]
    const at = (ev: { clientX: number; clientY: number }): Pt => ({ x: (ev.clientX - rect.left) / s, y: (ev.clientY - rect.top) / s })
    const pts: Pt[] = [at(e)]
    let liveD = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
    if (live) live.setAttribute('d', liveD)
    const move = (ev: PointerEvent) => {
      const p = at(ev)
      const last = pts[pts.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return
      if (pts.length >= 1200) return // runaway guard
      pts.push(p)
      liveD += ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`
      if (live) live.setAttribute('d', liveD)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (live) live.setAttribute('d', '')
      const d = finishStroke(pts)
      if (!d) return
      if (!fitsBudget(strokesNow, d)) {
        setInkFullAt({ pi, bi })
        if (inkTimer.current) clearTimeout(inkTimer.current)
        inkTimer.current = setTimeout(() => setInkFullAt(null), 2200)
        return
      }
      updatePanel(pi, (p) => ({
        ...p,
        boxes: p.boxes.map((b, j) => (j === bi && b.kind === 'draw' ? { ...b, strokes: [...b.strokes, d] } : b)),
      }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [onSelectBox, updatePanel])

  // ── mini-Dash anchor marker ────────────────────────────────────────────────
  const beginAnchorDrag = useCallback((e: ReactPointerEvent, pi: number, roof: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    const s = scaleRef.current
    const sx = e.clientX, sy = e.clientY
    let start: { dx: number; dy: number } | null = null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      updatePanel(pi, (p) => {
        if (!start) start = p.anchor
        const nx = Math.max(0, Math.min(round(start.dx + dx), p.w))
        const ny = roof ? 0 : Math.max(6, Math.min(round(start.dy + dy), p.h))
        return { ...p, anchor: { dx: nx, dy: ny } }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [updatePanel])

  // Arrow-key nudge / Delete on the selected panel (ignored while typing).
  useEffect(() => {
    if (selPanel == null || !page) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const step = e.shiftKey ? 8 : 1
      if (e.key === 'ArrowLeft') { e.preventDefault(); updatePanel(selPanel, (p) => ({ ...p, x: p.x - step })) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); updatePanel(selPanel, (p) => ({ ...p, x: p.x + step })) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); updatePanel(selPanel, (p) => ({ ...p, y: p.y - step })) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); updatePanel(selPanel, (p) => ({ ...p, y: p.y + step })) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selBox == null && page.panels.length > 1) {
        e.preventDefault()
        if (window.confirm('Delete panel ' + (selPanel + 1) + '?')) deletePanel(selPanel)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selPanel, selBox, page, updatePanel, deletePanel])

  const onStageDoubleClick = (e: ReactMouseEvent) => {
    if (!page) return
    const stage = stageRef.current
    if (!stage || e.target !== e.currentTarget) return
    const rect = stage.getBoundingClientRect()
    const x = round(((e.clientX - rect.left) / scale) - 100)
    const y = round(((e.clientY - rect.top) / scale) - 80)
    addPanel({
      x: Math.max(0, Math.min(x, STAGE_W - 240)), y: Math.max(0, Math.min(y, STAGE_H - 180)), w: 240, h: 180,
      anchor: { dx: 120, dy: 0 }, sketch: 'b',
      boxes: [{ kind: 'text', x: 18, y: 24, w: 200, h: 30, text: 'PANEL', fam: 'marker', size: 20 }],
    })
  }

  const stageStyle: CSSProperties = { position: 'absolute', top: 0, left: 0, width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="stage-sizer" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        {page ? (
          <div className="stage" style={stageStyle} ref={stageRef} onPointerDown={(e) => { if (e.target === e.currentTarget) onClear() }} onDoubleClick={onStageDoubleClick}>
            {gridOn && <div className="dotgrid" />}
            {page.panels.map((panel, pi) => {
              const pSel = pi === selPanel && selBox == null
              return (
                <div
                  key={pi}
                  data-testid={`panel-rect-${pi}`}
                  className="wpanel"
                  style={{
                    left: panel.x, top: panel.y, width: panel.w, height: panel.h,
                    borderRadius: SKETCH_RADII[panel.sketch ?? 'a'],
                    transform: panel.rotate ? `rotate(${panel.rotate}deg)` : undefined,
                    outline: pSel ? '2.5px solid #4a90d9' : undefined,
                    outlineOffset: pSel ? '3px' : undefined,
                  }}
                  onPointerDown={(e) => { if (mode === 'move') beginPanelDrag(e, pi, 'move') }}
                >
                  {/* display layer — the real renderers, non-interactive */}
                  <div className="wpanel-disp">
                    {panel.boxes.map((box, bi) => <Fragment key={bi}>{renderBox(box, flags)}</Fragment>)}
                  </div>

                  <input
                    className="pidtag"
                    value={panel.pid ?? ''}
                    placeholder={`P·${String(pi + 1).padStart(2, '0')}`}
                    spellCheck={false}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updatePanel(pi, (p) => ({ ...p, pid: e.target.value || undefined }))}
                  />

                  {/* interaction layer */}
                  {panel.boxes.map((box, bi) => {
                    const bSel = pi === selPanel && bi === selBox
                    const isDraw = box.kind === 'draw'
                    const penHere = mode === 'draw' && isDraw
                    return (
                      <div
                        key={bi}
                        data-testid={`box-${pi}-${bi}`}
                        className="wbox"
                        style={{
                          left: box.x, top: box.y, width: box.w, height: box.h,
                          transform: box.rot ? `rotate(${box.rot}deg)` : undefined,
                          cursor: penHere ? 'crosshair' : 'move',
                          background: penHere ? 'rgba(74,144,217,.04)' : undefined,
                        }}
                        onPointerDown={(e) => {
                          if (penHere) beginDraw(e, pi, bi, (box as DrawBox).strokes)
                          else if (mode === 'move') beginBoxDrag(e, pi, bi, 'move')
                        }}
                      >
                        {inkFullAt && inkFullAt.pi === pi && inkFullAt.bi === bi && (
                          <div className="ink-full-tag">out of ink — erase or use a new drawing box</div>
                        )}
                        {isDraw && (
                          <svg className="wbox-live" width="100%" height="100%">
                            <path
                              ref={(el) => { liveRefs.current[`${pi}-${bi}`] = el }}
                              d="" fill="none"
                              stroke={(box as DrawBox).strokeColor ?? '#1a1a1a'}
                              strokeWidth={(box as DrawBox).strokeW ?? 3}
                              strokeLinecap="round" strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        {bSel && <div className="wbox-sel" />}
                        {bSel && mode === 'move' && (
                          <div className="wbox-handle" onPointerDown={(e) => beginBoxDrag(e, pi, bi, 'size')} />
                        )}
                      </div>
                    )
                  })}

                  {pSel && mode === 'move' && (
                    <div className="wpanel-handle" onPointerDown={(e) => beginPanelDrag(e, pi, 'size')} />
                  )}
                </div>
              )
            })}

            {/* mini-Dash marker for the selected panel */}
            {selPanel != null && page.panels[selPanel] && (() => {
              const p = page.panels[selPanel]
              const roof = p.anchor.dy <= 4
              const limbs = POSE_LIMBS[p.arrival?.pose ?? 'none'] ?? POSE_LIMBS.none
              const left = p.x + p.anchor.dx - 16
              const top = p.y + p.anchor.dy - 46
              return (
                <div className="dashmark" style={{ left, top }} onPointerDown={(e) => beginAnchorDrag(e, selPanel, roof)}>
                  <div className="dashmark-fig">
                    <div className="dm-cape" />
                    <div className="dm-head" />
                    <div className="dm-body" />
                    <div className="dm-limb dm-armL" style={{ transform: `rotate(${limbs.aL}deg)` }} />
                    <div className="dm-limb dm-armR" style={{ transform: `rotate(${limbs.aR}deg)` }} />
                    <div className="dm-limb dm-legL" style={{ transform: `rotate(${limbs.lL}deg)` }} />
                    <div className="dm-limb dm-legR" style={{ transform: `rotate(${limbs.lR}deg)` }} />
                  </div>
                  <div className="dm-shadow" />
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="stage" style={stageStyle}>
            <CoverRenderer cover={cover} style={{ transform: 'none', transition: 'none', left: 0 }} onOpen={() => {}} />
          </div>
        )}
      </div>
    </div>
  )
}
