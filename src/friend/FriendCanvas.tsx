// The friend builder's two surfaces (handler patterns borrowed from the admin
// PageCanvas, scoped down to ONE editable panel):
//   <ContentCanvas>  — edit the boxes INSIDE your panel (drag/resize/type/draw)
//   <PlacePicker>    — drag your panel onto the current guestbook side, around
//                      the panels that are already there (overlap = blocked)
import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { renderBox } from '../notebook/PageRenderer'
import { SKETCH_RADII, type BoxDoc, type DrawBox, type PanelDoc } from '../notebook/doc/docTypes'
import { PAGE_W, PAGE_H } from '../notebook/doc/spread'
import { MIN_DIM, MAX_DIM, type SubmissionPanel } from '../notebook/doc/submission'
import { FRIEND_FULL_AT, occupancy, rectsOverlap } from '../notebook/doc/friendPages'

const MIN_BW = 40
const MIN_BH = 24
const round = (n: number) => Math.round(n)

// ── the content editor ───────────────────────────────────────────────────────
export function ContentCanvas({ panel, mode, selBox, onSelectBox, update }: {
  panel: SubmissionPanel
  mode: 'move' | 'draw'
  selBox: number | null
  onSelectBox: (bi: number | null) => void
  update: (fn: (p: SubmissionPanel) => SubmissionPanel) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const liveRefs = useRef<Record<number, SVGPathElement | null>>({})
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const recompute = () => {
      const s = Math.min((wrap.clientWidth - 24) / panel.w, (wrap.clientHeight - 24) / panel.h, 1.4)
      setScale(Math.max(0.3, s))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [panel.w, panel.h])

  const beginBoxDrag = useCallback((e: ReactPointerEvent, bi: number, kind: 'move' | 'size') => {
    e.preventDefault()
    e.stopPropagation()
    onSelectBox(bi)
    const s = scaleRef.current
    const sx = e.clientX, sy = e.clientY
    let start: BoxDoc | null = null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      update((p) => {
        const box = p.boxes[bi]
        if (!box) return p
        if (!start) start = box
        const next = { ...box }
        if (kind === 'move') {
          next.x = Math.max(0, Math.min(round(start.x + dx), p.w - box.w))
          next.y = Math.max(0, Math.min(round(start.y + dy), p.h - box.h))
        } else {
          next.w = Math.max(MIN_BW, Math.min(round(start.w + dx), p.w - box.x))
          next.h = Math.max(MIN_BH, Math.min(round(start.h + dy), p.h - box.y))
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
  }, [onSelectBox, update])

  // pen: record a stroke, commit on release (validator caps respected)
  const beginDraw = useCallback((e: ReactPointerEvent, bi: number) => {
    e.preventDefault()
    e.stopPropagation()
    onSelectBox(bi)
    const surf = e.currentTarget as HTMLElement
    const rect = surf.getBoundingClientRect()
    const s = scaleRef.current
    const live = liveRefs.current[bi]
    const pt = (ev: { clientX: number; clientY: number }) => ({
      x: ((ev.clientX - rect.left) / s).toFixed(1),
      y: ((ev.clientY - rect.top) / s).toFixed(1),
      nx: (ev.clientX - rect.left) / s,
      ny: (ev.clientY - rect.top) / s,
    })
    const p0 = pt(e)
    let d = `M${p0.x},${p0.y}`
    let lastX = p0.nx, lastY = p0.ny
    if (live) live.setAttribute('d', d)
    const move = (ev: PointerEvent) => {
      const p = pt(ev)
      if (Math.hypot(p.nx - lastX, p.ny - lastY) < 2) return
      if (d.length > 1400) return
      lastX = p.nx; lastY = p.ny
      d += ` L${p.x},${p.y}`
      if (live) live.setAttribute('d', d)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (live) live.setAttribute('d', '')
      if (d.includes('L')) {
        update((p) => ({
          ...p,
          boxes: p.boxes.map((b, j) => {
            if (j !== bi || b.kind !== 'draw') return b
            let strokes = [...b.strokes, d]
            while (strokes.length > 64 || strokes.reduce((n, sd) => n + sd.length, 0) > 6000) strokes = strokes.slice(1)
            return { ...b, strokes }
          }),
        }))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [onSelectBox, update])

  // panel resize (the corner handle) — clamped to the submission size limits
  const beginPanelSize = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const s = scaleRef.current
    const sx = e.clientX, sy = e.clientY
    let start: { w: number; h: number } | null = null
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      update((p) => {
        if (!start) start = { w: p.w, h: p.h }
        const w = Math.max(MIN_DIM, Math.min(round(start.w + dx), MAX_DIM))
        const h = Math.max(MIN_DIM, Math.min(round(start.h + dy), MAX_DIM))
        // keep boxes inside the shrunk panel
        const boxes = p.boxes.map((b) => ({
          ...b,
          x: Math.max(0, Math.min(b.x, w - Math.min(b.w, w))),
          y: Math.max(0, Math.min(b.y, h - Math.min(b.h, h))),
          w: Math.min(b.w, w),
          h: Math.min(b.h, h),
        }))
        return { w, h, boxes }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [update])

  return (
    <div className="fr-canvas" ref={wrapRef}>
      <div style={{ width: panel.w * scale, height: panel.h * scale, position: 'relative', margin: 'auto' }}>
        <div
          className="fr-panel"
          style={{ width: panel.w, height: panel.h, transform: `scale(${scale})`, transformOrigin: 'top left', borderRadius: SKETCH_RADII.b }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onSelectBox(null) }}
        >
          <div className="fr-disp">
            {panel.boxes.map((box, bi) => <Fragment key={bi}>{renderBox(box, {})}</Fragment>)}
          </div>
          {panel.boxes.map((box, bi) => {
            const bSel = bi === selBox
            const penHere = mode === 'draw' && box.kind === 'draw'
            return (
              <div
                key={bi}
                className="fr-box"
                style={{
                  left: box.x, top: box.y, width: box.w, height: box.h,
                  cursor: penHere ? 'crosshair' : 'move',
                  outline: bSel ? '2px dashed #4a90d9' : undefined,
                  background: penHere ? 'rgba(74,144,217,.05)' : undefined,
                }}
                onPointerDown={(e) => {
                  if (penHere) beginDraw(e, bi)
                  else beginBoxDrag(e, bi, 'move')
                }}
              >
                {box.kind === 'draw' && (
                  <svg className="fr-live" width="100%" height="100%">
                    <path
                      ref={(el) => { liveRefs.current[bi] = el }}
                      d="" fill="none"
                      stroke={(box as DrawBox).strokeColor ?? '#1a1a1a'}
                      strokeWidth={(box as DrawBox).strokeW ?? 3}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  </svg>
                )}
                {bSel && mode === 'move' && <div className="fr-handle" onPointerDown={(e) => beginBoxDrag(e, bi, 'size')} />}
              </div>
            )
          })}
          <div className="fr-panel-handle" title="resize your panel" onPointerDown={beginPanelSize} />
        </div>
      </div>
    </div>
  )
}

// ── the placement picker ─────────────────────────────────────────────────────
export function PlacePicker({ existing, panel, place, onPlace, sideLabel }: {
  existing: readonly PanelDoc[]
  panel: SubmissionPanel
  place: { x: number; y: number }
  onPlace: (p: { x: number; y: number }) => void
  sideLabel: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const recompute = () => setScale(Math.max(0.2, Math.min((wrap.clientWidth - 16) / PAGE_W, 0.75)))
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const overlapping = existing.some((p) => rectsOverlap({ ...place, w: panel.w, h: panel.h }, p))
  const occNow = occupancy(existing)
  const occAfter = occupancy([...existing, { ...place, w: panel.w, h: panel.h } as PanelDoc])

  const beginDrag = useCallback((e: ReactPointerEvent) => {
    e.preventDefault()
    const s = scaleRef.current
    const sx = e.clientX, sy = e.clientY
    const start = place
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / s
      const dy = (ev.clientY - sy) / s
      onPlace({
        x: Math.max(0, Math.min(round(start.x + dx), PAGE_W - panel.w)),
        y: Math.max(0, Math.min(round(start.y + dy), PAGE_H - panel.h)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [place, panel.w, panel.h, onPlace])

  return (
    <div className="fr-place" ref={wrapRef}>
      <div className="fr-place-meta">
        <span>{sideLabel}</span>
        <span className="grow" />
        <span className={occAfter > FRIEND_FULL_AT ? 'warn' : ''}>
          page fill: {Math.round(occNow * 100)}% → {Math.round(occAfter * 100)}% (the book grows a page at {Math.round(FRIEND_FULL_AT * 100)}%)
        </span>
      </div>
      <div className="fr-page-sizer" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
        <div className="fr-page" style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {existing.map((p, i) => (
            <div key={i} className="fr-ghost" style={{ left: p.x, top: p.y, width: p.w, height: p.h, borderRadius: SKETCH_RADII[p.sketch ?? 'a'] }}>
              <div className="fr-ghost-disp">
                {p.boxes.map((b, bi) => <Fragment key={bi}>{renderBox(b, {})}</Fragment>)}
              </div>
            </div>
          ))}
          <div
            className={`fr-mine${overlapping ? ' bad' : ''}`}
            style={{ left: place.x, top: place.y, width: panel.w, height: panel.h, borderRadius: SKETCH_RADII.b }}
            onPointerDown={beginDrag}
          >
            <div className="fr-ghost-disp">
              {panel.boxes.map((b, bi) => <Fragment key={bi}>{renderBox(b, {})}</Fragment>)}
            </div>
            <div className="fr-mine-tag">{overlapping ? 'overlapping — drag me' : 'your panel'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
