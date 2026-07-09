// Dev-only WYSIWYG admin shell. Loads notebook.json over the dev middleware into
// a single immutable draft; every edit flows through one `update(fn)` that also
// flags the doc dirty and re-validates. Save POSTs back to the middleware.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './admin.css'
import { tryValidateDoc, type NotebookDoc } from '../notebook/doc/validate'
import type { CoverDoc, PageDoc, PanelDoc } from '../notebook/doc/docTypes'
import { REGISTRY } from '../notebook/registry'
import { allFlagsOn, toGeom } from './shared'
import PageCanvas from './PageCanvas'
import Inspector from './Inspector'
import ActionEditor from './ActionEditor'
import Preview from './Preview'

type Sel = { kind: 'cover' } | { kind: 'page'; page: number }
type Tab = 'pages' | 'actions'

const NEW_PANEL: PanelDoc = { x: 60, y: 90, w: 240, h: 180, ax: 180, ay: 90, elements: [{ type: 'heading', text: 'PANEL', size: 20 }] }

export default function Admin() {
  const [doc, setDoc] = useState<NotebookDoc | null>(null)
  const [dirty, setDirty] = useState(false)
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
      .then((d) => setDoc(d as NotebookDoc))
      .catch((e) => setLoadErr(String(e)))
  }, [])

  const update = useCallback((fn: (d: NotebookDoc) => NotebookDoc) => {
    setDoc((d) => (d ? fn(d) : d))
    setDirty(true)
  }, [])

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

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
    if (res.status === 204) { setDirty(false); setSaveErrs(null); return }
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
        setDoc(parsed as NotebookDoc)
        setDirty(true)
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
    update((d) => ({ ...d, pages: [...d.pages, { name: 'PAGE ' + (d.pages.length + 1), snark: '', panels: [{ ...NEW_PANEL, elements: [{ type: 'heading', text: 'PANEL', size: 20 }] }] }] }))
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

  return (
    <div className="admin">
      <header className="hdr">
        <h1>notebook admin</h1>
        <span className={`status ${valid ? 'ok' : 'bad'}`}>{valid ? '✓ valid' : `✕ ${errs.length} issue${errs.length === 1 ? '' : 's'}`}</span>
        <span className="grow" />
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
