// Dev-only WYSIWYG admin shell. Loads notebook.json over the dev middleware into
// a single immutable draft; every edit flows through one `update(fn)` that also
// flags the doc dirty and re-validates. Save POSTs back to the middleware.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './admin.css'
import { tryValidateDoc, type NotebookDoc } from '../notebook/doc/validate'
import type { BuiltinMode, CoverDoc, PageDoc, PanelDoc } from '../notebook/doc/docTypes'
import { REGISTRY } from '../notebook/registry'
import { allFlagsOn, toGeom } from './shared'
import PageCanvas from './PageCanvas'
import Inspector from './Inspector'
import ActionEditor from './ActionEditor'
import Preview from './Preview'

type Sel = { kind: 'cover' } | { kind: 'page'; page: number }
type Tab = 'pages' | 'actions'

const NEW_PANEL: PanelDoc = { x: 60, y: 90, w: 240, h: 180, anchor: { dx: 120, dy: 0 }, boxes: [{ kind: 'text', x: 16, y: 16, w: 200, h: 26, text: 'PANEL', fam: 'marker', size: 20 }] }

export default function Admin() {
  const [doc, setDoc] = useState<NotebookDoc | null>(null)
  // Undo/redo history of IMMUTABLE doc snapshots. `savedDocRef` marks the
  // last-persisted snapshot; because snapshots are shared by reference, dirty is
  // just `doc !== savedDocRef.current` (undoing back to it clears the dot).
  const undoRef = useRef<NotebookDoc[]>([])
  const redoRef = useRef<NotebookDoc[]>([])
  const savedDocRef = useRef<NotebookDoc | null>(null)
  const docRef = useRef<NotebookDoc | null>(null)
  const lastPushRef = useRef(0) // wall-clock of the last history push (drag coalescing)
  const [histTick, setHistTick] = useState(0) // force re-render when stacks change
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErrs, setSaveErrs] = useState<string[] | null>(null)
  const [showErrs, setShowErrs] = useState(true)
  const [tab, setTab] = useState<Tab>('pages')
  const [sel, setSel] = useState<Sel>({ kind: 'page', page: 0 })
  const [panelSel, setPanelSel] = useState<number | null>(0)
  const [actionSel, setActionSel] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/__notebook')
      .then((r) => r.json())
      .then((d) => {
        savedDocRef.current = d as NotebookDoc
        undoRef.current = []
        redoRef.current = []
        lastPushRef.current = 0 // fresh history after load
        setDoc(d as NotebookDoc)
      })
      .catch((e) => setLoadErr(String(e)))
  }, [])

  const update = useCallback((fn: (d: NotebookDoc) => NotebookDoc) => {
    setDoc((d) => {
      if (!d) return d
      // Coalesce a continuous gesture (drag / fast typing) into ONE history entry:
      // only snapshot when >COALESCE_MS have passed since the last push, so a
      // single ⌘Z reverts the whole drag rather than one sub-pixel increment.
      const now = Date.now()
      if (now - lastPushRef.current > 400) {
        undoRef.current.push(d)
        if (undoRef.current.length > 100) undoRef.current.shift()
      }
      lastPushRef.current = now
      return fn(d)
    })
    redoRef.current = []
    setHistTick((t) => t + 1)
  }, [])

  const undo = useCallback(() => {
    if (undoRef.current.length === 0) return
    const cur = docRef.current
    const prev = undoRef.current.pop()!
    if (cur) redoRef.current.push(cur)
    lastPushRef.current = 0 // the next edit starts a fresh history entry
    setDoc(prev)
    setHistTick((t) => t + 1)
  }, [])
  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return
    const cur = docRef.current
    const next = redoRef.current.pop()!
    if (cur) undoRef.current.push(cur)
    lastPushRef.current = 0
    setDoc(next)
    setHistTick((t) => t + 1)
  }, [])

  docRef.current = doc
  const dirty = doc !== null && doc !== savedDocRef.current
  void histTick // history mutations bump this to re-render undo/redo affordances

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo — capture phase so it beats the preview
  // controls, but skipped over form fields so native input undo still wins.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [undo, redo])

  // After any doc swap (edit / undo / redo / import) clamp the selection so a
  // removed page / panel / action can't strand the UI on a stale index.
  useEffect(() => {
    if (!doc) return
    setSel((s) => (s.kind === 'page' && s.page > doc.pages.length - 1) ? { kind: 'page', page: doc.pages.length - 1 } : s)
    setPanelSel((ps) => {
      if (ps == null) return ps
      const s = docRef.current!
      const pg = s.pages[Math.min(ps < 0 ? 0 : ps, s.pages.length - 1)]
      const cur = sel.kind === 'page' ? s.pages[Math.min(sel.page, s.pages.length - 1)] : pg
      return cur && ps > cur.panels.length - 1 ? Math.max(0, cur.panels.length - 1) : ps
    })
    setActionSel((as) => (as && !(doc.actions ?? {})[as]) ? null : as)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // Notebook (mounted by Preview) registers global arrow/space/a/s keydown
  // handlers on window. Swallow keys that target form fields (capture phase) so
  // typing in the inspector isn't hijacked by the preview's controls.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) e.stopPropagation()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  const validation = useMemo(() => (doc ? tryValidateDoc(doc) : null), [doc])
  const valid = validation?.ok ?? false

  const save = async () => {
    if (!doc) return
    const res = await fetch('/__notebook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
    if (res.status === 204) { savedDocRef.current = doc; lastPushRef.current = 0; setSaveErrs(null); setHistTick((t) => t + 1); return }
    const body = await res.json().catch(() => ({ errors: ['save failed (' + res.status + ')'] }))
    setSaveErrs(body.errors ?? ['save failed'])
    setShowErrs(true)
  }

  const exportDoc = () => {
    if (!doc) return
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'notebook.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importDoc = (file: File) => {
    file.text().then((txt) => {
      try {
        const parsed = JSON.parse(txt)
        undoRef.current = []
        redoRef.current = []
        lastPushRef.current = 0 // fresh history after import
        setDoc(parsed as NotebookDoc)
        setHistTick((t) => t + 1)
        setSaveErrs(null)
      } catch (e) { setSaveErrs(['import: ' + (e as Error).message]); setShowErrs(true) }
    })
  }

  if (loadErr) return <div className="admin"><div className="errs">failed to load /__notebook — is the dev server running?<br />{loadErr}</div></div>
  if (!doc) return <div className="admin"><div className="empty" style={{ margin: 'auto' }}>loading document…</div></div>

  // ── doc mutators bound to the current selection ────────────────────────────
  const curPage = sel.kind === 'page' ? sel.page : null
  const updatePage = (i: number, fn: (p: PageDoc) => PageDoc) =>
    update((d) => ({ ...d, pages: d.pages.map((p, idx) => (idx === i ? fn(p) : p)) }))
  const updatePanel = (pi: number, fn: (pn: PanelDoc) => PanelDoc) => {
    if (curPage == null) return
    updatePage(curPage, (p) => ({ ...p, panels: p.panels.map((pn, idx) => (idx === pi ? fn(pn) : pn)) }))
  }

  const page = curPage != null ? doc.pages[curPage] : null
  const flags = allFlagsOn(doc)
  const errs: string[] = (validation && !validation.ok ? validation.errors : []).concat(saveErrs ?? [])
  const contextPanel = toGeom(doc.pages[curPage ?? 0].panels[0])
  const selectedPanel = panelSel != null && page ? page.panels[panelSel] ?? null : null

  const selectPage = (i: number) => { setSel({ kind: 'page', page: i }); setPanelSel(0) }

  // ── page-list operations ───────────────────────────────────────────────────
  const addPage = () => {
    update((d) => ({ ...d, pages: [...d.pages, { name: 'PAGE ' + (d.pages.length + 1), snark: '', panels: [{ ...NEW_PANEL, boxes: [{ kind: 'text', x: 16, y: 16, w: 200, h: 26, text: 'PANEL', fam: 'marker', size: 20 }] }] }] }))
    setSel({ kind: 'page', page: doc.pages.length })
    setPanelSel(0)
  }
  const renamePage = (i: number, name: string) => updatePage(i, (p) => ({ ...p, name: name || p.name }))
  const movePage = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= doc.pages.length) return
    update((d) => { const pages = d.pages.slice(); [pages[i], pages[j]] = [pages[j], pages[i]]; return { ...d, pages } })
    setSel({ kind: 'page', page: j })
  }
  const deletePage = (i: number) => {
    if (doc.pages.length <= 1) { window.alert('a notebook needs at least one page'); return }
    if (!window.confirm('Delete page "' + doc.pages[i].name + '"?')) return
    update((d) => ({ ...d, pages: d.pages.filter((_, idx) => idx !== i) }))
    setSel({ kind: 'page', page: Math.max(0, i - 1) })
    setPanelSel(0)
  }

  const testAction = (name: string) => {
    setPreviewOpen(true)
    const target = (curPage ?? 0) + 1
    type Hooks = { __notebookGoTo?: (p: number) => void; __notebookBusy?: () => boolean; __notebookRunAction?: (n: string) => void }
    const w = window as unknown as Hooks
    const start = Date.now()
    const run = () => {
      if (Date.now() - start > 6000) return
      if (!w.__notebookGoTo || !w.__notebookRunAction) { setTimeout(run, 150); return }
      w.__notebookGoTo(target)
      const poll = () => {
        if (Date.now() - start > 6000) return
        if (w.__notebookBusy && w.__notebookBusy()) { setTimeout(poll, 120); return }
        w.__notebookRunAction!(name)
      }
      setTimeout(poll, 500)
    }
    setTimeout(run, 400)
  }

  const testBuiltin = (mode: BuiltinMode) => {
    setPreviewOpen(true)
    const target = (curPage ?? 0) + 1
    type Hooks = { __notebookGoTo?: (p: number) => void; __notebookBusy?: () => boolean; __notebookRunBuiltin?: (m: string) => void }
    const w = window as unknown as Hooks
    const start = Date.now()
    const run = () => {
      if (Date.now() - start > 6000) return
      if (!w.__notebookGoTo || !w.__notebookRunBuiltin) { setTimeout(run, 150); return }
      w.__notebookGoTo(target)
      const poll = () => {
        if (Date.now() - start > 6000) return
        if (w.__notebookBusy && w.__notebookBusy()) { setTimeout(poll, 120); return }
        w.__notebookRunBuiltin!(mode)
      }
      setTimeout(poll, 500)
    }
    setTimeout(run, 400)
  }

  return (
    <div className="admin">
      <header className="hdr">
        <h1>notebook admin</h1>
        <span className={`status ${valid ? 'ok' : 'bad'}`}>{valid ? '✓ valid' : `✕ ${errs.length} issue${errs.length === 1 ? '' : 's'}`}</span>
        <span className="grow" />
        <button className="btn mini" onClick={undo} disabled={undoRef.current.length === 0} title="Undo (⌘Z)">↩</button>
        <button className="btn mini" onClick={redo} disabled={redoRef.current.length === 0} title="Redo (⇧⌘Z)">↪</button>
        <button className="btn" onClick={exportDoc}>Export</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importDoc(f); e.target.value = '' }} />
        <button className="btn primary" data-testid="save-btn" disabled={!valid} onClick={save}>
          Save{dirty && <span className="dot" />}
        </button>
      </header>

      {errs.length > 0 && showErrs && (
        <div className="errs">
          <div className="errs-head"><b>{errs.length} issue{errs.length === 1 ? '' : 's'}</b><button className="btn mini" onClick={() => setShowErrs(false)}>hide</button></div>
          {errs.slice(0, 40).map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      <div className="body">
        <aside className="rail">
          <div className="tabsw">
            <button className={`btn${tab === 'pages' ? ' primary' : ''}`} onClick={() => setTab('pages')}>Pages</button>
            <button className={`btn${tab === 'actions' ? ' primary' : ''}`} onClick={() => setTab('actions')}>Actions</button>
          </div>
          <div className="rail-sec">Pages<span className="grow" /><button className="btn mini" onClick={addPage}>+ page</button></div>
          <div className={`pitem${sel.kind === 'cover' ? ' active' : ''}`} onClick={() => { setSel({ kind: 'cover' }); setPanelSel(null) }}>
            <span className="nm">◈ Cover</span>
          </div>
          {doc.pages.map((p, i) => (
            <PageRow
              key={i}
              name={p.name}
              active={sel.kind === 'page' && sel.page === i}
              onSelect={() => selectPage(i)}
              onRename={(n) => renamePage(i, n)}
              onUp={() => movePage(i, -1)}
              onDown={() => movePage(i, 1)}
              onDelete={() => deletePage(i)}
            />
          ))}
        </aside>

        <main className="center">
          {tab === 'pages' ? (
            <PageCanvas
              page={page}
              cover={doc.cover}
              flags={flags}
              selected={panelSel}
              onSelect={setPanelSel}
              updatePanel={updatePanel}
              addPanel={(pnl) => { if (curPage != null) { updatePage(curPage, (pg) => ({ ...pg, panels: [...pg.panels, pnl] })); setPanelSel(page ? page.panels.length : 0) } }}
              deletePanel={(pi) => { if (curPage != null && page && page.panels.length > 1) { updatePage(curPage, (pg) => ({ ...pg, panels: pg.panels.filter((_, idx) => idx !== pi) })); setPanelSel(0) } }}
            />
          ) : (
            <ActionEditor
              actions={doc.actions ?? {}}
              selected={actionSel}
              onSelect={setActionSel}
              updateActions={(fn) => update((d) => ({ ...d, actions: fn(d.actions ?? {}) }))}
              contextPanel={contextPanel}
              onTest={testAction}
              onTestBuiltin={testBuiltin}
            />
          )}
        </main>

        {tab === 'pages' && (
          <aside className="inspector">
            <Inspector
              kind={sel.kind}
              cover={doc.cover}
              panel={selectedPanel}
              actionNames={Object.keys(doc.actions ?? {})}
              registryKeys={Object.keys(REGISTRY)}
              updateCover={(fn: (c: CoverDoc) => CoverDoc) => update((d) => ({ ...d, cover: fn(d.cover) }))}
              updatePanel={(fn: (p: PanelDoc) => PanelDoc) => { if (panelSel != null) updatePanel(panelSel, fn) }}
            />
          </aside>
        )}
      </div>

      <Preview doc={doc} open={previewOpen} onToggle={() => setPreviewOpen((o) => !o)} />
    </div>
  )
}

function PageRow({ name, active, onSelect, onRename, onUp, onDown, onDelete }: {
  name: string
  active: boolean
  onSelect: () => void
  onRename: (n: string) => void
  onUp: () => void
  onDown: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  return (
    <div className={`pitem${active ? ' active' : ''}`} onClick={onSelect}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); onRename(draft) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="nm" onDoubleClick={(e) => { e.stopPropagation(); setDraft(name); setEditing(true) }}>{name}</span>
      )}
      <button className="btn mini" onClick={(e) => { e.stopPropagation(); onUp() }}>▲</button>
      <button className="btn mini" onClick={(e) => { e.stopPropagation(); onDown() }}>▼</button>
      <button className="btn mini" onClick={(e) => { e.stopPropagation(); onDelete() }}>✕</button>
    </div>
  )
}
