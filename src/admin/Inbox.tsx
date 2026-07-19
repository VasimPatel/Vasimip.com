// ─────────────────────────────────────────────────────────────────────────────
// FRIENDS' PANELS — the owner-side inbox. A rail card (with a pending-count badge)
// opens a comic overlay, mirroring the Dojo pattern: a submissions list on the
// left, a mini preview + approve/reject/add-to-page on the right, and an invites
// manager (create / copy-link / revoke) below.
//
// "→ add to this page" approves the submission (if still pending) and drops its
// panel into the CURRENT page draft via the parent's `onAddToPage`; the owner then
// arranges and saves it normally (this component never touches the save path).
//
// DEV file mode: /api/invites doesn't exist, so the probe returns null and the
// overlay shows a "connect to the real server" hint instead of the manager.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useCallback, useEffect, useState } from 'react'
import { renderBox } from '../notebook/PageRenderer'
import { SKETCH_RADII, type PanelDoc } from '../notebook/doc/docTypes'
import { normalizeSubmission, type FriendSubmission, type SubmissionPanel } from '../notebook/doc/submission'
import { BUILTIN_INFO } from '../notebook/doc/builtinInfo'
import {
  approveSubmission, createInvite, listInvites, listSubmissions, rejectSubmission, revokeInvite,
  type InviteRow, type SubmissionRow,
} from './inboxStore'

interface Props {
  /** Insert a submitted panel into the current page draft (owner arranges/saves). */
  onAddToPage: (panel: PanelDoc) => void
  /** Graft the FULL submission into the guestbook (65% growth, placement,
   *  travel pool, trick action) — returns false if the graft failed. */
  onAddToGuestbook: (sub: FriendSubmission, author: string | null) => boolean
  /** Current page name for the button label; null when the cover is selected. */
  pageName: string | null
}

const PREVIEW_SCALE = 0.5

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

/** Non-interactive mini render of a submitted panel (sketch border + boxes at ½). */
function MiniPanel({ panel }: { panel: SubmissionPanel }) {
  return (
    <div className="inbox-mini" style={{ width: panel.w * PREVIEW_SCALE, height: panel.h * PREVIEW_SCALE, borderRadius: SKETCH_RADII.b }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: panel.w, height: panel.h, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
        {panel.boxes.map((b, i) => <Fragment key={i}>{renderBox(b, {})}</Fragment>)}
      </div>
    </div>
  )
}

export default function Inbox({ onAddToPage, onAddToGuestbook, pageName }: Props) {
  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null) // null = probing
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [detailErr, setDetailErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  // create-invite form
  const [label, setLabel] = useState('')
  const [slug, setSlug] = useState('')
  const [expiryDays, setExpiryDays] = useState(14)
  const [maxUses, setMaxUses] = useState(5)
  const [inviteErr, setInviteErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [s, inv] = await Promise.all([listSubmissions(), listInvites()])
    if (s == null || inv == null) { setAvailable(false); return }
    setAvailable(true)
    // Pending first, then newest.
    setSubs([...s].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.id - a.id))
    setInvites(inv)
  }, [])

  // One probe on mount to light the badge (not a live poll); refresh again on open.
  useEffect(() => { void refresh() }, [refresh])

  const pending = subs.filter((s) => s.status === 'pending').length
  const selected = subs.find((s) => s.id === selId) ?? null

  const openInbox = () => { setOpen(true); void refresh() }

  // Esc closes the overlay (skip when a field has focus).
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [open])

  const doReview = async (id: number, kind: 'approve' | 'reject') => {
    setBusy(true)
    const ok = kind === 'approve' ? await approveSubmission(id) : await rejectSubmission(id)
    setBusy(false)
    if (ok) await refresh()
  }

  /** Approve first if still pending, holding `busy` through the refresh and
   *  re-reading the FRESH status (codex: releasing busy mid-flight let a
   *  reject/second-click race the graft). false = stop. */
  const ensureApproved = async (s: SubmissionRow): Promise<boolean> => {
    setDetailErr(null)
    if (s.status === 'rejected') return false
    if (s.status === 'approved') return true
    const ok = await approveSubmission(s.id)
    if (!ok) { setDetailErr('could not approve this panel — try again.'); return false }
    const fresh = await listSubmissions()
    await refresh()
    return fresh?.find((r) => r.id === s.id)?.status === 'approved'
  }

  const addToPage = async (s: SubmissionRow, sub: FriendSubmission) => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await ensureApproved(s))) return
      const { w, h, boxes } = sub.panel
      onAddToPage({ x: 40, y: 40, w, h, anchor: { dx: w / 2, dy: 0 }, sketch: 'b', boxes, pid: undefined })
      setOpen(false)
    } finally { setBusy(false) }
  }

  const addToGuestbook = async (s: SubmissionRow, sub: FriendSubmission) => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await ensureApproved(s))) return
      if (!onAddToGuestbook(sub, s.authorName)) {
        setDetailErr('the guestbook graft failed — the book may be at its page cap; try "add to this page" instead.')
        return
      }
      setOpen(false)
    } finally { setBusy(false) }
  }

  const submit = async () => {
    setBusy(true)
    setInviteErr(null)
    const res = await createInvite({
      label: label.trim() || undefined,
      slug: slug.trim() ? slug.trim().toLowerCase() : undefined,
      expiresInDays: expiryDays,
      maxUses,
    })
    setBusy(false)
    if (res && 'error' in res) { setInviteErr(res.error); return }
    if (res) { setLabel(''); setSlug(''); await refresh() }
    else setInviteErr('could not create the link — try again')
  }

  const revoke = async (id: number) => {
    setBusy(true)
    await revokeInvite(id)
    setBusy(false)
    await refresh()
  }

  const copyLink = (row: InviteRow) => {
    navigator.clipboard?.writeText(row.url).catch(() => {})
    setCopied(row.id)
    setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 1400)
  }

  return (
    <>
      <div className="inboxcard" data-testid="inbox-card" onClick={openInbox}>
        <div className="ic-title">FRIENDS' PANELS →</div>
        <div className="ic-sub">panels your friends drew — review &amp; place them</div>
        {pending > 0 && <span className="ic-badge" data-testid="inbox-badge">{pending}</span>}
      </div>

      {open && (
        <div className="dojo-overlay">
          <div className="dojo-screen">
            <div className="dojo-head">
              <span className="dojo-title">FRIENDS' PANELS</span>
              <span className="dojo-sub">review what friends drew, then drop it onto a page</span>
              <span className="grow" />
              <div className="dojo-x" onClick={() => setOpen(false)} title="close (Esc)">✕</div>
            </div>

            {available === false ? (
              <div className="dojo-blank">connect to the real server (bun run start) to manage invites &amp; submissions — the dev file server doesn't host them.</div>
            ) : (
              <div className="inbox-body">
                {/* submissions list */}
                <div className="inbox-list">
                  <div className="inbox-lhead">submissions {subs.length > 0 && <span className="inbox-dim">({subs.length})</span>}</div>
                  {subs.length === 0 ? (
                    <div className="inbox-empty">nothing submitted yet</div>
                  ) : subs.map((s) => (
                    <div
                      key={s.id}
                      className={`inbox-row${s.id === selId ? ' active' : ''}`}
                      data-testid={`sub-row-${s.id}`}
                      onClick={() => { setSelId(s.id); setDetailErr(null) }}
                    >
                      <div className="inbox-row-name">{s.authorName || 'someone'}</div>
                      <div className="inbox-row-sub">{relTime(s.createdAt)}{s.inviteLabel ? ' · ' + s.inviteLabel : ''}</div>
                      <span className={`chip ${s.status}`}>{s.status}</span>
                    </div>
                  ))}
                </div>

                {/* detail */}
                <div className="inbox-detail">
                  {selected ? (() => {
                    const sub = normalizeSubmission(selected.panel)
                    if (!sub) return <div className="inbox-err">this submission's payload doesn't parse — reject it.</div>
                    return (
                      <>
                        <div className="inbox-detail-head">
                          <b>{selected.authorName || 'someone'}</b>
                          <span className={`chip ${selected.status}`}>{selected.status}</span>
                          <span className="inbox-dim">{relTime(selected.createdAt)}</span>
                        </div>
                        <div className="inbox-preview-wrap"><MiniPanel panel={sub.panel} /></div>
                        <div className="inbox-meta">
                          {sub.placement && <span className="inbox-tag">📍 wants ({sub.placement.x}, {sub.placement.y})</span>}
                          {sub.travel && <span className="inbox-tag">🏃 {sub.travel.map((m) => BUILTIN_INFO[m].label).join(', ')}</span>}
                          {sub.trick && <span className="inbox-tag">⚡ trick: {sub.trick.name} ({sub.trick.steps.length} steps)</span>}
                          {sub.arrival && (
                            <span className="inbox-tag">
                              🎭 {[sub.arrival.pose, sub.arrival.say ? `"${sub.arrival.say}"` : null].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {sub.note && <span className="inbox-tag note">💬 "{sub.note}"</span>}
                        </div>
                        <div className="inbox-actions">
                          <button className="ibtn ok" disabled={busy || selected.status === 'approved'} onClick={() => doReview(selected.id, 'approve')}>✓ approve</button>
                          <button className="ibtn no" disabled={busy || selected.status === 'rejected'} onClick={() => doReview(selected.id, 'reject')}>✕ reject</button>
                          {selected.status !== 'rejected' && (
                            <>
                              <button className="ibtn add" data-testid="add-to-guestbook" disabled={busy} title="graft it into the growing FRIENDS pages (placement, travel, trick and all)" onClick={() => addToGuestbook(selected, sub)}>→ add to the guestbook</button>
                              <button className="ibtn" disabled={busy || pageName == null} title={pageName == null ? 'select a page first' : 'content only, onto ' + pageName} onClick={() => addToPage(selected, sub)}>→ this page (content only)</button>
                            </>
                          )}
                        </div>
                        {detailErr && <div className="inbox-err">{detailErr}</div>}
                      </>
                    )
                  })() : (
                    <div className="inbox-empty">pick a submission to preview it</div>
                  )}

                  {/* invites manager */}
                  <div className="inbox-invites">
                    <div className="inbox-lhead">invite links</div>
                    <div className="invite-create">
                      <input className="note-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (e.g. pals)" />
                      <input
                        className="note-input"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="custom link (optional, e.g. sam)"
                        title="/sketchbook-invite/<this> — leave blank for a random link"
                      />
                      <label className="invite-num">expires <input type="number" min={0} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} />d</label>
                      <label className="invite-num">uses <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} /></label>
                      <button className="ibtn" disabled={busy} onClick={submit}>+ create link</button>
                    </div>
                    {inviteErr && <div className="inbox-err">{inviteErr}</div>}
                    {invites.map((row) => (
                      <div key={row.id} className="invite-row" data-testid={`invite-row-${row.id}`}>
                        <div className="invite-meta">
                          <div className="invite-label">{row.label || <span className="inbox-dim">(no label)</span>} <span className={`chip ${row.status}`}>{row.status}</span></div>
                          <div className="invite-sub">{row.useCount}/{row.maxUses ?? '∞'} used · {row.submissionCount} submitted{row.pendingCount > 0 ? ' · ' + row.pendingCount + ' pending' : ''}</div>
                        </div>
                        <button className="ibtn tiny" onClick={() => copyLink(row)}>{copied === row.id ? 'copied ✓' : 'copy link'}</button>
                        {row.status !== 'revoked' && <button className="ibtn tiny no" disabled={busy} onClick={() => revoke(row.id)}>revoke</button>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
