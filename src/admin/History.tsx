// The admin header's "history" menu: a comic dropdown listing recent revisions
// with a [restore] per row. Restore = the server writes a NEW revision pointing
// at the old doc (history never rewrites), then we re-load the doc + reset the
// admin's undo history via `onRestored`.
//
// In DEV file mode the Vite middleware has no /api/revisions, so `listRevisions`
// returns null on the first probe → we render NOTHING (the button never appears).
import { useCallback, useEffect, useRef, useState } from 'react'
import { listRevisions, restoreRevision, type Revision } from './docStore'

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (s < 60) return s + 's ago'
  const m = Math.round(s / 60)
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  return Math.round(h / 24) + 'd ago'
}

export default function History({ onRestored }: { onRestored: () => void }) {
  const [available, setAvailable] = useState<boolean | null>(null) // null = probing
  const [open, setOpen] = useState(false)
  const [revs, setRevs] = useState<Revision[]>([])
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const list = await listRevisions()
    if (list == null) { setAvailable(false); return }
    setAvailable(true); setRevs(list)
  }, [])

  useEffect(() => { void refresh() }, [refresh]) // probe availability on mount

  // Click-away to close the dropdown.
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  if (available === false) return null

  const toggle = () => { const n = !open; setOpen(n); if (n) void refresh() }

  const restore = async (id: number) => {
    setBusy(true)
    const ok = await restoreRevision(id)
    setBusy(false)
    if (!ok) return
    setOpen(false)
    onRestored()
  }

  return (
    <div className="hist-wrap" ref={wrapRef}>
      <button className="qbtn" onClick={toggle} disabled={available == null}>history ▾</button>
      {open && (
        <div className="hist-menu">
          <div className="hist-head">recent revisions</div>
          {revs.length === 0 ? (
            <div className="hist-empty">no revisions yet</div>
          ) : (
            revs.map((r) => (
              <div className="hist-row" key={r.id}>
                <div className="hist-meta">
                  <div className="hist-note">{r.note || <span className="hist-dim">(no note)</span>}</div>
                  <div className="hist-sub">#{r.id} · {r.createdBy || 'someone'} · {relTime(r.createdAt)}</div>
                </div>
                <button className="hist-restore" disabled={busy} onClick={() => restore(r.id)}>restore</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
