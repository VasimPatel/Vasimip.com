// Collapsible bottom drawer embedding the REAL <Notebook doc={draft}/> so edits
// can be seen (and actions ▶ Test-ed) live. Notebook renders position:fixed
// elements (its root + HUD); a CSS `transform` on an ancestor becomes the
// containing block for fixed descendants, so scaling the wrapper actually
// CONTAINS them inside the drawer instead of letting them escape to the viewport.
// The draft→Notebook prop is debounced ~300ms so fast typing doesn't thrash the
// (componentDidUpdate-driven) doc swap.
import { useEffect, useRef, useState } from 'react'
import Notebook from '../notebook/Notebook'
import type { NotebookDoc } from '../notebook/doc/validate'

const SCALE = 0.55

export default function Preview({ doc, open, onToggle }: { doc: NotebookDoc; open: boolean; onToggle: () => void }) {
  const [debounced, setDebounced] = useState(doc)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(doc), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [doc])

  return (
    <div className={`preview${open ? ' open' : ''}`}>
      <div className="preview-bar" onClick={onToggle}>
        <span>▸ Live preview</span>
        <span className="grow" />
        <span className="muted">{open ? 'click to collapse' : 'click to expand'}</span>
      </div>
      {open && (
        <div className="preview-body">
          {/* transform on this wrapper contains Notebook's fixed root + HUD */}
          <div className="preview-frame" style={{ transform: `scale(${SCALE})`, width: `${100 / SCALE}%`, height: `${100 / SCALE}%` }}>
            <Notebook doc={debounced} soundOn={false} pipSnark={false} />
          </div>
        </div>
      )}
    </div>
  )
}
