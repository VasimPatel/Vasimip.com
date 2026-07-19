// ─────────────────────────────────────────────────────────────────────────────
// /make-a-panel/<token> — the friend-facing guestbook builder.
//
// A friend with a live invite: draws a panel (text + pen), places it on the
// current guestbook side (the same 65%-growth logic approval uses), picks which
// travel verbs Dash may use to reach it, optionally teaches Dash ONE custom
// stunt in a scoped-down Dash Dojo (the owner's ActionEditor, reused), watches
// the whole thing live in an embedded real <Notebook> (the submission grafted
// exactly as approval would graft it), and submits. The submission is a
// REQUEST: it lands in the owner's inbox for review; nothing touches the live
// book until the owner approves and saves.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../admin/admin.css'
import './friend.css'
import Notebook from '../notebook/Notebook'
import ActionEditor from '../admin/ActionEditor'
import { loadDoc } from '../admin/docStore'
import { ARRIVAL_POSES, BUILTIN_MODES, type ActionDoc, type ArrivalPose, type BoxDoc, type BuiltinMode } from '../notebook/doc/docTypes'
import { BUILTIN_INFO } from '../notebook/doc/builtinInfo'
import type { NotebookDoc } from '../notebook/doc/validate'
import { validateFriendSubmission, TRICK_NAME_RE, type FriendSubmission, type SubmissionPanel } from '../notebook/doc/submission'
import { findSpot, graftSubmission, newGuestPage, nextFriendSlot, slotPanels } from '../notebook/doc/friendPages'
import { ContentCanvas, PlacePicker } from './FriendCanvas'

type Phase = 'checking' | 'invalid' | 'building' | 'sending' | 'sent'

/** Friendly blurbs for the closed-set arrival poses. */
const ARRIVAL_INFO: Record<ArrivalPose, string> = {
  fight: '⚔️ en-garde sword stance',
  think: '🤔 deep thought',
  spray: '🎨 spray-paint flourish',
  cheer: '🎉 victory cheer',
}

const START_PANEL: SubmissionPanel = {
  w: 300,
  h: 220,
  boxes: [
    { kind: 'text', x: 18, y: 14, w: 260, h: 26, text: 'HELLO, IT ME', fam: 'marker', size: 20, hl: 'yellow' },
    { kind: 'draw', x: 18, y: 54, w: 260, h: 140, strokes: [], strokeColor: '#1a1a1a', strokeW: 3.5 },
  ],
}

/** Sanitize a dojo action name into the trick slug the validator accepts. */
function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return TRICK_NAME_RE.test(s) ? s : 'stunt'
}

export default function MakeAPanel({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [inviteLabel, setInviteLabel] = useState<string | undefined>(undefined)
  const [liveDoc, setLiveDoc] = useState<NotebookDoc | null>(null)

  const [panel, setPanel] = useState<SubmissionPanel>(START_PANEL)
  const [selBox, setSelBox] = useState<number | null>(0)
  const [mode, setMode] = useState<'move' | 'draw'>('move')
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null)
  const [verbs, setVerbs] = useState<BuiltinMode[]>([])
  const [tricks, setTricks] = useState<Record<string, ActionDoc>>({})
  const [trickSel, setTrickSel] = useState<string | null>(null)
  const [dojoOpen, setDojoOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [authorName, setAuthorName] = useState('')
  const [note, setNote] = useState('')
  const [arrPose, setArrPose] = useState<ArrivalPose | ''>('')
  const [arrSay, setArrSay] = useState('')
  const [sendErrs, setSendErrs] = useState<string[] | null>(null)
  /** No invites API reachable (vite file-mode dev): open the builder anyway,
   *  banner up, submit disabled — the same grace the admin's dev probe gets. */
  const [devMode, setDevMode] = useState(false)

  // token check + live doc fetch (both public endpoints)
  useEffect(() => {
    const ac = new AbortController()
    Promise.all([
      fetch(`/api/invite/${encodeURIComponent(token)}`, { signal: ac.signal })
        .then(async (r) => {
          // A REAL rejection is a JSON 404 from the API; anything else (proxy
          // 5xx, HTML, network) means "no invites server here" → dev grace.
          if (r.ok && r.headers.get('content-type')?.includes('application/json')) return await r.json()
          if (r.status === 404 && r.headers.get('content-type')?.includes('application/json')) return { valid: false }
          return { dev: true }
        })
        .catch(() => ({ dev: true })),
      loadDoc(ac.signal).catch(() => null),
    ]).then(([inv, loaded]) => {
      const i = inv as { valid?: boolean; dev?: boolean; label?: string }
      if (i.dev) setDevMode(true)
      else if (!i.valid) { setPhase('invalid'); return }
      setInviteLabel(i.label)
      if (loaded) setLiveDoc(loaded.doc)
      setPhase('building')
    })
    return () => ac.abort()
  }, [token])

  // ── the target side (canonical next slot; approval recomputes the same way) ──
  const slot = useMemo(() => (liveDoc ? nextFriendSlot(liveDoc) : null), [liveDoc])
  const existing = useMemo(() => {
    if (!liveDoc || !slot) return newGuestPage(1).panels
    return slot.pageIdx == null ? newGuestPage(1).panels : slotPanels(liveDoc, slot)
  }, [liveDoc, slot])
  const sideLabel = slot?.pageIdx == null
    ? 'a brand-new FRIENDS page (you would be first!)'
    : `${liveDoc?.pages[slot.pageIdx]?.name ?? 'FRIENDS'} · ${slot.side}`

  // default placement: first free spot for the current panel size
  useEffect(() => {
    if (phase !== 'building' || place) return
    setPlace(findSpot(existing, panel.w, panel.h) ?? { x: 24, y: 24 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, existing])
  // keep the placement in-bounds when the panel is resized
  useEffect(() => {
    setPlace((p) => (p ? { x: Math.min(p.x, 920 - panel.w), y: Math.min(p.y, 660 - panel.h) } : p))
  }, [panel.w, panel.h])

  // ── the submission object (single source for preview, validation, and POST) ──
  const trickName = trickSel && tricks[trickSel] ? trickSel : Object.keys(tricks)[0] ?? null
  const sub: FriendSubmission = useMemo(() => ({
    version: 2,
    panel,
    ...(place ? { placement: place } : {}),
    ...(verbs.length > 0 ? { travel: verbs } : {}),
    ...(trickName && tricks[trickName] && tricks[trickName].steps.length > 0
      ? { trick: { name: slugify(trickName), steps: tricks[trickName].steps } }
      : {}),
    ...(arrPose || arrSay.trim()
      ? { arrival: { ...(arrPose ? { pose: arrPose } : {}), ...(arrSay.trim() ? { say: arrSay.trim().slice(0, 80) } : {}) } }
      : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  }), [panel, place, verbs, trickName, tricks, arrPose, arrSay, note])

  const validation = useMemo(() => validateFriendSubmission(sub), [sub])

  // ── the live preview: the submission grafted into the real book ─────────────
  const graft = useMemo(() => {
    if (!liveDoc) return null
    return graftSubmission(liveDoc, sub, authorName.trim() || 'you')
  }, [liveDoc, sub, authorName])
  const [debouncedDoc, setDebouncedDoc] = useState<NotebookDoc | null>(null)
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!previewOpen || !graft) return
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => setDebouncedDoc(graft.doc), 350)
    return () => { if (debTimer.current) clearTimeout(debTimer.current) }
  }, [graft, previewOpen])

  /** Flip the embedded book to the friend's panel and run their stunt. */
  const watchIt = useCallback(() => {
    setPreviewOpen(true)
    if (!graft) return
    const targetViewPage = graft.pageIdx + (graft.side === 'back' ? 2 : 1)
    type Hooks = { __notebookGoTo?: (p: number) => void; __notebookBusy?: () => boolean; __notebookRunAction?: (n: string) => void }
    const w = window as unknown as Hooks
    const start = Date.now()
    const run = () => {
      if (Date.now() - start > 8000) return
      if (!w.__notebookGoTo) { setTimeout(run, 150); return }
      w.__notebookGoTo(targetViewPage)
      const poll = () => {
        if (Date.now() - start > 8000) return
        if (w.__notebookBusy && w.__notebookBusy()) { setTimeout(poll, 150); return }
        if (graft.trickName && w.__notebookRunAction) w.__notebookRunAction(graft.trickName)
      }
      setTimeout(poll, 600)
    }
    setTimeout(run, 400)
  }, [graft])

  // ── box editing helpers ─────────────────────────────────────────────────────
  const updatePanel = useCallback((fn: (p: SubmissionPanel) => SubmissionPanel) => setPanel(fn), [])
  const addBox = (kind: 'text' | 'draw') => {
    const box: BoxDoc = kind === 'text'
      ? { kind: 'text', x: 16, y: Math.min(40, panel.h - 50), w: Math.min(200, panel.w - 32), h: 40, text: 'more words', fam: 'hand', size: 16 }
      : { kind: 'draw', x: 16, y: Math.min(50, panel.h - 110), w: Math.min(220, panel.w - 32), h: Math.min(120, panel.h - 60), strokes: [], strokeColor: '#1a1a1a', strokeW: 3.5 }
    setPanel((p) => ({ ...p, boxes: [...p.boxes, box] }))
    setSelBox(panel.boxes.length)
    if (kind === 'draw') setMode('draw')
  }
  const deleteBox = () => {
    if (selBox == null) return
    setPanel((p) => ({ ...p, boxes: p.boxes.filter((_, i) => i !== selBox) }))
    setSelBox(null)
  }
  const box = selBox != null ? panel.boxes[selBox] ?? null : null
  const updateBox = (fn: (b: BoxDoc) => BoxDoc) => {
    if (selBox == null) return
    setPanel((p) => ({ ...p, boxes: p.boxes.map((b, i) => (i === selBox ? fn(b) : b)) }))
  }

  const send = async () => {
    if (!validation.ok || sending) return
    setPhase('sending')
    setSendErrs(null)
    try {
      const res = await fetch(`/api/invite/${encodeURIComponent(token)}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorName: authorName.trim(), panel: sub }),
      })
      if (res.status === 201) { setPhase('sent'); return }
      const body = await res.json().catch(() => ({}))
      const errors = (body as { errors?: string[] }).errors
      setSendErrs(errors && errors.length > 0 ? errors : [`submit failed (${res.status})${res.status === 404 ? ' — this invite may have expired' : ''}`])
      setPhase('building')
    } catch {
      setSendErrs(['could not reach the notebook — try again in a moment'])
      setPhase('building')
    }
  }
  const sending = phase === 'sending'

  // ── screens ─────────────────────────────────────────────────────────────────
  if (phase === 'checking') {
    return <div className="fr-shell"><div className="fr-card">…checking your invite</div></div>
  }
  if (phase === 'invalid') {
    return (
      <div className="fr-shell">
        <div className="fr-card">
          <div className="fr-h1">HMM.</div>
          <p>This invite link isn't working — it may have expired, been used up, or been revoked.</p>
          <p className="fr-dim">Ask whoever sent it for a fresh one.</p>
        </div>
      </div>
    )
  }
  if (phase === 'sent') {
    return (
      <div className="fr-shell">
        <div className="fr-card">
          <div className="fr-h1">IN THE MAIL. ✉️</div>
          <p>Your panel is on the owner's desk. If it survives review, it gets glued into the guestbook{trickName ? ' — stunt and all' : ''}.</p>
          <p className="fr-dim">Come back to <a href="/">the notebook</a> later and flip to the FRIENDS pages.</p>
        </div>
      </div>
    )
  }

  const authorOk = authorName.trim().length >= 1 && authorName.trim().length <= 40
  const canSend = validation.ok && authorOk && !sending && !devMode

  return (
    <div className="fr-shell fr-build">
      <header className="fr-top">
        <div className="fr-brand">DRAW YOURSELF IN <span>· Dash's guestbook</span></div>
        <span className="grow" />
        {inviteLabel && <span className="fr-invitee">invite: {inviteLabel}</span>}
        {devMode && <span className="fr-invitee">dev preview — no invite server, submitting is off</span>}
      </header>

      <main className="fr-main">
        <section className="fr-sec">
          <div className="fr-sec-h">1 · YOUR PANEL <span className="fr-dim">({panel.w}×{panel.h} — drag the corner to resize)</span></div>
          <div className="fr-toolrow">
            <div className={`fr-seg${mode === 'move' ? ' on' : ''}`} onClick={() => setMode('move')}>✋ move</div>
            <div className={`fr-seg${mode === 'draw' ? ' on' : ''}`} onClick={() => setMode('draw')}>✏️ draw</div>
            <div className="fr-tbtn" onClick={() => addBox('text')}>+ words</div>
            <div className="fr-tbtn" onClick={() => addBox('draw')}>+ drawing</div>
            {box && <div className="fr-tbtn danger" onClick={deleteBox}>✕ delete box</div>}
          </div>
          <ContentCanvas panel={panel} mode={mode} selBox={selBox} onSelectBox={setSelBox} update={updatePanel} />
          {box && box.kind === 'text' && (
            <div className="fr-boxbar">
              <textarea className="fr-text" rows={2} value={box.text} onChange={(e) => updateBox((b) => ({ ...b, text: e.target.value.slice(0, 500) }))} />
              <select value={box.fam ?? 'hand'} onChange={(e) => updateBox((b) => ({ ...b, fam: e.target.value as 'hand' | 'marker' | 'caveat' }))}>
                <option value="hand">hand</option><option value="marker">marker</option><option value="caveat">caveat</option>
              </select>
              <input type="number" min={10} max={44} value={box.size ?? 16} onChange={(e) => updateBox((b) => ({ ...b, size: Math.max(10, Math.min(44, Number(e.target.value) || 16)) }))} />
              <select value={box.hl ?? ''} onChange={(e) => updateBox((b) => ({ ...b, hl: (e.target.value || undefined) as 'yellow' | 'pink' | undefined }))}>
                <option value="">no highlight</option><option value="yellow">yellow</option><option value="pink">pink</option>
              </select>
              <input type="color" value={box.color ?? '#1a1a1a'} onChange={(e) => updateBox((b) => ({ ...b, color: e.target.value }))} />
            </div>
          )}
          {box && box.kind === 'draw' && (
            <div className="fr-boxbar">
              <span className="fr-dim">pen:</span>
              <input type="color" value={box.strokeColor ?? '#1a1a1a'} onChange={(e) => updateBox((b) => (b.kind === 'draw' ? { ...b, strokeColor: e.target.value } : b))} />
              <input type="range" min={1.5} max={8} step={0.5} value={box.strokeW ?? 3.5} onChange={(e) => updateBox((b) => (b.kind === 'draw' ? { ...b, strokeW: Number(e.target.value) } : b))} />
              <div className="fr-tbtn" onClick={() => updateBox((b) => (b.kind === 'draw' ? { ...b, strokes: b.strokes.slice(0, -1) } : b))}>↩ undo stroke</div>
              <div className="fr-tbtn" onClick={() => updateBox((b) => (b.kind === 'draw' ? { ...b, strokes: [] } : b))}>clear</div>
            </div>
          )}
        </section>

        <section className="fr-sec">
          <div className="fr-sec-h">2 · PUT IT ON THE PAGE</div>
          {place && <PlacePicker existing={existing} panel={panel} place={place} onPlace={setPlace} sideLabel={sideLabel} />}
          <p className="fr-dim fr-note">Your spot is a request — the owner can nudge it, and if someone else's panel lands first the book re-arranges around it.</p>
        </section>

        <section className="fr-sec">
          <div className="fr-sec-h">3 · DASH AT YOUR PANEL <span className="fr-dim">(what he does when he arrives)</span></div>
          <div className="fr-verbs">
            <div className={`fr-verb${arrPose === '' ? ' on' : ''}`} onClick={() => setArrPose('')}>just stands there</div>
            {ARRIVAL_POSES.map((p) => (
              <div key={p} className={`fr-verb${arrPose === p ? ' on' : ''}`} onClick={() => setArrPose(p)}>
                {ARRIVAL_INFO[p]}
              </div>
            ))}
          </div>
          <div className="fr-toolrow">
            <input
              className="fr-msg"
              placeholder='what he says on arrival (optional, e.g. "nice panel, right?")'
              maxLength={80}
              value={arrSay}
              onChange={(e) => setArrSay(e.target.value)}
            />
          </div>
        </section>

        <section className="fr-sec">
          <div className="fr-sec-h">4 · HOW DASH GETS THERE <span className="fr-dim">(pick none for "surprise me")</span></div>
          <div className="fr-verbs">
            {BUILTIN_MODES.map((m) => (
              <div
                key={m}
                className={`fr-verb${verbs.includes(m) ? ' on' : ''}`}
                title={BUILTIN_INFO[m].blurb}
                onClick={() => setVerbs((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]))}
              >
                {BUILTIN_INFO[m].label}
              </div>
            ))}
          </div>
          <div className="fr-dojo-row">
            {trickName && tricks[trickName]?.steps.length ? (
              <>
                <span className="fr-trick-chip">⚡ {slugify(trickName)} <span className="fr-dim">({tricks[trickName].steps.length} steps)</span></span>
                <div className="fr-tbtn" onClick={() => setDojoOpen(true)}>edit stunt</div>
                <div className="fr-tbtn danger" onClick={() => { setTricks({}); setTrickSel(null) }}>✕ drop it</div>
              </>
            ) : (
              <div className="fr-tbtn dojo" onClick={() => setDojoOpen(true)}>⚡ teach Dash YOUR stunt (optional)</div>
            )}
          </div>
        </section>

        <section className="fr-sec">
          <div className="fr-sec-h">5 · SEE IT LIVE <span className="fr-dim">(the real book, with your panel glued in)</span></div>
          <div className="fr-toolrow">
            <div className="fr-tbtn" onClick={() => { setPreviewOpen((o) => !o); if (!debouncedDoc && graft) setDebouncedDoc(graft.doc) }}>
              {previewOpen ? 'hide preview' : 'open preview'}
            </div>
            <div className="fr-tbtn dojo" onClick={watchIt}>▶ watch Dash arrive{trickName ? ' (your stunt)' : ''}</div>
            {graft?.nudged && <span className="fr-dim">…your spot didn't quite fit — the preview nudged it.</span>}
          </div>
          {previewOpen && debouncedDoc && (
            <div className="fr-preview">
              <div className="fr-preview-frame" style={{ transform: 'scale(0.5)', width: '200%', height: '200%' }}>
                <Notebook doc={debouncedDoc} soundOn={false} pipSnark={false} />
              </div>
            </div>
          )}
        </section>

        <section className="fr-sec">
          <div className="fr-sec-h">6 · SIGN &amp; SEND</div>
          <div className="fr-sendrow">
            <input className="fr-name" placeholder="your name (required)" maxLength={40} value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
            <input className="fr-msg" placeholder="a note to the owner (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="fr-send" disabled={!canSend} onClick={send}>{sending ? 'sending…' : 'submit for review'}</button>
            {!authorOk && validation.ok && !devMode && <span className="fr-dim">⬅ sign your name and it unlocks</span>}
          </div>
          {!validation.ok && (
            <div className="fr-errs">{validation.errors.slice(0, 6).map((e, i) => <div key={i}>• {e}</div>)}</div>
          )}
          {sendErrs && <div className="fr-errs">{sendErrs.map((e, i) => <div key={i}>• {e}</div>)}</div>}
          <p className="fr-dim fr-note">Submitting sends a REQUEST — the owner reviews it (and can tweak it) before it appears in the book.</p>
        </section>
      </main>

      {dojoOpen && (
        <div className="dojo-overlay">
          <div className="dojo-screen">
            <div className="dojo-head">
              <span className="dojo-title">THE DASH DOJO <span className="fr-dim">· guest pass</span></span>
              <span className="dojo-sub">teach Dash the stunt he'll use to reach YOUR panel — no code, just sentences</span>
              <span className="grow" />
              <div className="dojo-x" onClick={() => setDojoOpen(false)} title="close">✕</div>
            </div>
            <ActionEditor
              actions={tricks}
              selected={trickSel}
              onSelect={setTrickSel}
              updateActions={(fn) => setTricks((t) => fn(t))}
              contextPanel={{
                x: place?.x ?? 0, y: place?.y ?? 0, w: panel.w, h: panel.h,
                ax: (place?.x ?? 0) + Math.round(panel.w / 2), ay: place?.y ?? 0,
              }}
              onTest={() => { setDojoOpen(false); watchIt() }}
              onTestBuiltin={() => { setDojoOpen(false); watchIt() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
