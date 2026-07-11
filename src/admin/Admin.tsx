// Dev-only WYSIWYG admin shell — "DASH'S NOTEBOOK". Loads notebook.json over the
// dev middleware into a single immutable draft; every edit flows through one
// `update(fn)` that also flags the doc dirty and re-validates. Save POSTs back to
// the middleware. The UI is a whiteboard editor: a page rail, a scaled 920×660
// stage of draggable panels/boxes, and a right-hand context editor. The Actions
// editor lives behind the DASH DOJO door.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './admin.css'
import { tryValidateDoc, type NotebookDoc } from '../notebook/doc/validate'
import type { BoxDoc, BuiltinMode, CoverDoc, PageDoc, PanelDoc } from '../notebook/doc/docTypes'
import { allFlagsOn, toGeom } from './shared'
import PageCanvas from './PageCanvas'
import Inspector from './Inspector'
import ActionEditor from './ActionEditor'
import Preview from './Preview'

type Sel = { kind: 'cover' } | { kind: 'page'; page: number }

const seedTextBox = (w: number): BoxDoc => ({ kind: 'text', x: 18, y: 24, w: Math.min(200, w - 36), h: 30, text: 'PANEL', fam: 'marker', size: 20 })
const NEW_PANEL: PanelDoc = { x: 340, y: 240, w: 240, h: 180, anchor: { dx: 120, dy: 0 }, sketch: 'b', boxes: [seedTextBox(240)] }

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
  const [showErrs, setShowErrs] = useState(false)
  const [sel, setSel] = useState<Sel>({ kind: 'page', page: 0 })
  const [panelSel, setPanelSel] = useState<number | null>(0)
  const [boxSel, setBoxSel] = useState<number | null>(null)
  const [actionSel, setActionSel] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mode, setMode] = useState<'move' | 'draw'>('move')
  const [gridOn, setGridOn] = useState(true)
  const [dojoOpen, setDojoOpen] = useState(false)
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
  // removed page / panel / box / action can't strand the UI on a stale index.
  useEffect(() => {
    if (!doc) return
    setSel((s) => (s.kind === 'page' && s.page > doc.pages.length - 1) ? { kind: 'page', page: doc.pages.length - 1 } : s)
    const s = docRef.current!
    const pg = sel.kind === 'page' ? s.pages[Math.min(sel.page, s.pages.length - 1)] : null
    setPanelSel((ps) => (ps == null || !pg) ? ps : (ps > pg.panels.length - 1 ? Math.max(0, pg.panels.length - 1) : ps))
    setBoxSel((bs) => {
      if (bs == null || !pg || panelSel == null) return bs
      const pn = pg.panels[Math.min(panelSel, pg.panels.length - 1)]
      return pn && bs > pn.boxes.length - 1 ? null : bs
    })
    setActionSel((as) => (as && !(doc.actions ?? {})[as]) ? null : as)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // Notebook (mounted by Preview) registers global arrow/space/a/s keydown
  // handlers on window. Swallow keys that target form fields (capture phase) so
  // typing in the editor isn't hijacked by the preview's controls.
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
  if (!doc) return <div className="admin"><div className="ce-empty" style={{ margin: 'auto' }}>loading the notebook…</div></div>

  // ── doc mutators bound to the current selection ────────────────────────────
  const curPage = sel.kind === 'page' ? sel.page : null
  const updatePage = (i: number, fn: (p: PageDoc) => PageDoc) =>
    update((d) => ({ ...d, pages: d.pages.map((p, idx) => (idx === i ? fn(p) : p)) }))
  const updatePanel = (pi: number, fn: (pn: PanelDoc) => PanelDoc) => {
    if (curPage == null) return
    updatePage(curPage, (p) => ({ ...p, panels: p.panels.map((pn, idx) => (idx === pi ? fn(pn) : pn)) }))
  }
  const updateBox = (fn: (b: BoxDoc) => BoxDoc) => {
    if (panelSel == null || boxSel == null) return
    updatePanel(panelSel, (pn) => ({ ...pn, boxes: pn.boxes.map((b, j) => (j === boxSel ? fn(b) : b)) }))
  }

  const page = curPage != null ? doc.pages[curPage] : null
  const flags = allFlagsOn(doc)
  const errs: string[] = (validation && !validation.ok ? validation.errors : []).concat(saveErrs ?? [])
  const selectedPanel = panelSel != null && page ? page.panels[panelSel] ?? null : null
  const selectedBox = selectedPanel && boxSel != null ? selectedPanel.boxes[boxSel] ?? null : null
  const contextPanel = toGeom(page?.panels[panelSel ?? 0] ?? doc.pages[0].panels[0])

  const selectPage = (i: number) => { setSel({ kind: 'page', page: i }); setPanelSel(0); setBoxSel(null) }
  const selectCover = () => { setSel({ kind: 'cover' }); setPanelSel(null); setBoxSel(null) }

  // ── page-list operations ───────────────────────────────────────────────────
  const addPage = () => {
    update((d) => ({ ...d, pages: [...d.pages, { name: 'PAGE ' + (d.pages.length + 1), snark: '', panels: [{ ...NEW_PANEL, boxes: [seedTextBox(240)] }] }] }))
    setSel({ kind: 'page', page: doc.pages.length })
    setPanelSel(0); setBoxSel(null)
  }

  // ── canvas plumbing ─────────────────────────────────────────────────────────
  const addPanel = (pnl: PanelDoc) => {
    if (curPage == null || !page) return
    updatePage(curPage, (pg) => ({ ...pg, panels: [...pg.panels, pnl] }))
    setPanelSel(page.panels.length); setBoxSel(null)
  }
  const addPanelDefault = () => addPanel({ ...NEW_PANEL, boxes: [seedTextBox(240)] })
  const deletePanel = () => {
    if (curPage == null || !page || page.panels.length <= 1 || panelSel == null) { if (page && page.panels.length <= 1) window.alert('a page needs at least one panel'); return }
    updatePage(curPage, (pg) => ({ ...pg, panels: pg.panels.filter((_, idx) => idx !== panelSel) }))
    setPanelSel(0); setBoxSel(null)
  }
  const addBox = (kind: 'text' | 'draw') => {
    if (!page) return
    const pi = panelSel ?? 0
    const pn = page.panels[pi]
    if (!pn) return
    const box: BoxDoc = kind === 'text'
      ? { kind: 'text', x: 18, y: Math.max(8, Math.min(40, pn.h - 60)), w: Math.min(190, pn.w - 36), h: 44, text: 'new words', fam: 'hand', size: 20 }
      : { kind: 'draw', x: 18, y: Math.max(8, Math.min(64, pn.h - 120)), w: Math.min(220, pn.w - 36), h: Math.min(130, pn.h - 80), strokes: [], strokeColor: '#1a1a1a', strokeW: 3.5 }
    updatePanel(pi, (p) => ({ ...p, boxes: [...p.boxes, box] }))
    setPanelSel(pi); setBoxSel(pn.boxes.length)
    if (kind === 'draw') setMode('draw')
  }
  const deleteBox = () => {
    if (panelSel == null || boxSel == null) return
    updatePanel(panelSel, (p) => ({ ...p, boxes: p.boxes.filter((_, j) => j !== boxSel) }))
    setBoxSel(null)
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

  const statusClass = errs.length > 0 ? 'bad' : dirty ? 'warn' : 'ok'
  const statusText = errs.length > 0 ? `⚠ ${errs.length} problem${errs.length === 1 ? '' : 's'}` : dirty ? 'unsaved scribbles' : '✓ saved'
  const seg = (m: 'move' | 'draw') => `seg${mode === m ? ' on' : ''}`

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">DASH'S NOTEBOOK <span>· the whiteboard</span></div>
        <div className={`statuschip ${statusClass}`} onClick={() => setShowErrs((v) => !v)} title="click to see problems">{statusText}</div>
        <span className="grow" />
        <button className="qbtn" onClick={undo} disabled={undoRef.current.length === 0} title="Undo (⌘Z)">↩</button>
        <button className="qbtn" onClick={redo} disabled={redoRef.current.length === 0} title="Redo (⇧⌘Z)">↪</button>
        <button className="qbtn" onClick={exportDoc}>export</button>
        <button className="qbtn" onClick={() => fileRef.current?.click()}>import</button>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importDoc(f); e.target.value = '' }} />
        <button className="savebtn" data-testid="save-btn" disabled={!valid} onClick={save}>{dirty ? 'save the page' : 'saved ✓'}</button>
      </header>

      {errs.length > 0 && showErrs && (
        <div className="errs">
          <div className="errs-head"><b>{errs.length} problem{errs.length === 1 ? '' : 's'}</b><button className="qbtn" onClick={() => setShowErrs(false)}>hide</button></div>
          {errs.slice(0, 40).map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      <div className="deck">
        <div className="seg-group">
          <div className={seg('move')} onClick={() => setMode('move')}>✋ move</div>
          <div className={seg('draw')} onClick={() => setMode('draw')}>✏️ draw</div>
        </div>
        <div className="tbtn" onClick={() => addBox('text')}>+ text box</div>
        <div className="tbtn" onClick={() => addBox('draw')}>+ drawing</div>
        <div className="tbtn" onClick={addPanelDefault}>+ new panel</div>
        <div className="seg-group">
          <div className={`seg${undoRef.current.length ? '' : ' dim'}`} onClick={undo}>↶ undo</div>
          <div className={`seg${redoRef.current.length ? '' : ' dim'}`} onClick={redo}>redo ↷</div>
        </div>
        <span className="deck-hint">drag boxes to arrange · ✏️ draw to scribble inside a drawing box · rename any P· tag · ⌘Z to undo</span>
      </div>

      <div className="board">
        <aside className="rail">
          {doc.pages.map((p, i) => (
            <div
              key={i}
              className={`pagecard${sel.kind === 'page' && sel.page === i ? ' active' : ''}`}
              style={{ transform: `rotate(${i % 2 === 0 ? -0.7 : 0.8}deg)` }}
              onClick={() => selectPage(i)}
            >
              <div className="pc-name">{p.name}</div>
              <div className="pc-snark">{p.snark}</div>
            </div>
          ))}
          <div className="tear" onClick={addPage}>+ tear in a new page</div>
          <div className={`covercard${sel.kind === 'cover' ? ' active' : ''}`} onClick={selectCover}>◈ Cover</div>
          <span className="grow" />
          <div className="dojodoor" onClick={() => setDojoOpen(true)}>
            <div className="dd-title">DASH DOJO →</div>
            <div className="dd-sub">teach Dash brand-new stunts (the advanced stuff)</div>
          </div>
        </aside>

        <main className="stagewrap">
          <PageCanvas
            page={page}
            cover={doc.cover}
            flags={flags}
            mode={mode}
            gridOn={gridOn}
            selPanel={panelSel}
            selBox={boxSel}
            onSelectPanel={(i) => { setPanelSel(i); setBoxSel(null) }}
            onSelectBox={(pi, bi) => { setPanelSel(pi); setBoxSel(bi) }}
            onClear={() => { setPanelSel(null); setBoxSel(null) }}
            updatePanel={updatePanel}
            addPanel={addPanel}
            deletePanel={() => { if (panelSel != null) deletePanel() }}
          />
          <div className="grid-toggle" onClick={() => setGridOn((v) => !v)}>{gridOn ? '▦ grid on' : '▦ grid off'}</div>
        </main>

        <aside className="context">
          <Inspector
            selKind={sel.kind === 'cover' ? 'cover' : panelSel != null ? 'panel' : 'none'}
            cover={doc.cover}
            panel={selectedPanel}
            panelIndex={panelSel}
            box={selectedBox}
            boxIndex={boxSel}
            actionNames={Object.keys(doc.actions ?? {})}
            updateCover={(fn: (c: CoverDoc) => CoverDoc) => update((d) => ({ ...d, cover: fn(d.cover) }))}
            updatePanel={(fn: (p: PanelDoc) => PanelDoc) => { if (panelSel != null) updatePanel(panelSel, fn) }}
            updateBox={updateBox}
            addBox={addBox}
            deleteBox={deleteBox}
            deletePanel={deletePanel}
            selectBox={(bi) => setBoxSel(bi)}
          />
        </aside>
      </div>

      {dojoOpen && (
        <div className="dojo-overlay" onClick={() => setDojoOpen(false)}>
          <div className="dojo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dojo-head">
              <span className="dojo-title">THE DASH DOJO</span>
              <span className="dojo-sub">where Dash learns new stunts — no code, just sentences</span>
              <span className="grow" />
              <div className="dojo-x" onClick={() => setDojoOpen(false)}>✕</div>
            </div>
            <div className="dojo-editor">
              <ActionEditor
                actions={doc.actions ?? {}}
                selected={actionSel}
                onSelect={setActionSel}
                updateActions={(fn) => update((d) => ({ ...d, actions: fn(d.actions ?? {}) }))}
                contextPanel={contextPanel}
                onTest={testAction}
                onTestBuiltin={testBuiltin}
              />
            </div>
          </div>
        </div>
      )}

      <Preview doc={doc} open={previewOpen} onToggle={() => setPreviewOpen((o) => !o)} />
    </div>
  )
}
