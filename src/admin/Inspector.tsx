// The right-hand "context editor" — a white card with a pink top rule whose
// contents follow the current selection: a panel (tag, box list, tilt/size,
// the arrival SENTENCE + advanced fine-print, travel chips), a text box (words,
// fonts, colours, per-letter spinner, note card), a draw box (ink + nib), an art
// box (locked component), the cover, or nothing. Everything maps 1:1 onto the
// real doc — nothing is silently dropped.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ARRIVAL_POSES, BUILTIN_MODES, SFX_KINDS,
  type ArrivalDoc, type ArtBox, type BoxDoc, type CoverDoc, type DrawBox, type PanelDoc, type TextBox,
} from '../notebook/doc/docTypes'
import { BUILTIN_INFO } from '../notebook/doc/builtinInfo'

interface Props {
  selKind: 'cover' | 'panel' | 'none'
  cover: CoverDoc
  panel: PanelDoc | null
  panelIndex: number | null
  box: BoxDoc | null
  boxIndex: number | null
  actionNames: string[]
  updateCover: (fn: (c: CoverDoc) => CoverDoc) => void
  updatePanel: (fn: (p: PanelDoc) => PanelDoc) => void
  updateBox: (fn: (b: BoxDoc) => BoxDoc) => void
  addBox: (kind: 'text' | 'draw') => void
  deleteBox: () => void
  deletePanel: () => void
  selectBox: (bi: number) => void
}

// sentence-flavoured control styling (dashed underline, ink-blue, Caveat picks)
const PICK: CSSProperties = { fontFamily: 'Caveat,cursive', fontSize: 19, color: '#2a4b8d', border: 'none', borderBottom: '2px dashed #b0a88e', background: 'transparent', outline: 'none', cursor: 'pointer' }
const SAY: CSSProperties = { width: 104, fontSize: 16, border: 'none', borderBottom: '2px dashed #b0a88e', background: 'transparent', outline: 'none', color: '#2a4b8d', padding: '1px 2px' }

const TEXT_COLORS = ['#1a1a1a', '#5a544a', '#8a8378', '#d9534f', '#2a4b8d']
const INK_COLORS = ['#1a1a1a', '#d9534f', '#2a4b8d', '#2e8b57']
const HL_DOTS: { k: 'none' | 'yellow' | 'pink'; sw: string }[] = [
  { k: 'none', sw: '#fff' }, { k: 'yellow', sw: '#ffd23f' }, { k: 'pink', sw: '#f9a8c9' },
]
const NIBS = [{ v: 2, n: 'thin' }, { v: 3.5, n: 'pen' }, { v: 6, n: 'fat' }]
const FONTS: { k: 'hand' | 'marker' | 'caveat'; css: string }[] = [
  { k: 'hand', css: "'Patrick Hand'" }, { k: 'marker', css: "'Permanent Marker'" }, { k: 'caveat', css: 'Caveat' },
]

export default function Inspector(props: Props) {
  return (
    <div className="ce">
      <div className="ce-rule" />
      <Body {...props} />
    </div>
  )
}

function Body(props: Props) {
  const { selKind, cover, panel, box } = props
  if (selKind === 'cover') return <CoverEditor cover={cover} updateCover={props.updateCover} />
  if (selKind === 'none' || !panel) {
    return <div className="ce-empty">click a box on the page to edit it here.<br /><span>or drop in a + text box / + drawing.</span></div>
  }
  if (box) {
    if (box.kind === 'text') return <TextBoxEditor key={`${props.panelIndex}-${props.boxIndex}`} box={box} updateBox={props.updateBox} deleteBox={props.deleteBox} />
    if (box.kind === 'draw') return <DrawBoxEditor box={box} updateBox={props.updateBox} deleteBox={props.deleteBox} />
    return <ArtBoxEditor box={box} updateBox={props.updateBox} deleteBox={props.deleteBox} />
  }
  return <PanelEditor {...props} panel={panel} panelIndex={props.panelIndex ?? 0} />
}

// ── cover ──────────────────────────────────────────────────────────────────
function CoverEditor({ cover, updateCover }: { cover: CoverDoc; updateCover: (fn: (c: CoverDoc) => CoverDoc) => void }) {
  return (
    <div className="ce-pad">
      <div className="ce-head"><span className="ce-title">THE COVER</span><span className="ce-sub">the front of the book</span></div>
      <div className="ce-lbl">whose notebook is this</div>
      <input className="ce-line" value={cover.name} onChange={(e) => updateCover((c) => ({ ...c, name: e.target.value }))} />
      <div className="ce-lbl">and it's all about</div>
      <input className="ce-line" value={cover.subject} onChange={(e) => updateCover((c) => ({ ...c, subject: e.target.value }))} />
      <div className="ce-lbl">the little dare underneath</div>
      <textarea className="ce-area" rows={2} value={cover.snark} onChange={(e) => updateCover((c) => ({ ...c, snark: e.target.value }))} />
    </div>
  )
}

// ── panel ──────────────────────────────────────────────────────────────────
function PanelEditor({ panel, panelIndex, actionNames, updatePanel, deletePanel, addBox, selectBox }: Props & { panel: PanelDoc; panelIndex: number }) {
  const a = panel.arrival ?? {}
  const setArr = (p: Partial<ArrivalDoc>) => updatePanel((pn) => {
    const next: ArrivalDoc = { ...pn.arrival, ...p }
    for (const k of Object.keys(next) as (keyof ArrivalDoc)[]) if (next[k] === undefined) delete next[k]
    return { ...pn, arrival: Object.keys(next).length ? next : undefined }
  })
  const roof = panel.anchor.dy <= 4
  const setSpot = (v: string) => updatePanel((p) => v === 'roof'
    ? { ...p, anchor: { dx: Math.round(p.w / 2), dy: 0 } }
    : { ...p, anchor: { dx: p.anchor.dx || Math.round(p.w / 2), dy: p.anchor.dy > 4 ? p.anchor.dy : Math.round(p.h / 2) } })

  return (
    <div className="ce-pad">
      <div className="ce-head"><span className="ce-title">THIS PANEL</span><span className="ce-sub">#{panelIndex + 1}</span></div>

      <div className="ce-lbl">panel tag</div>
      <input className="ce-tag" value={panel.pid ?? ''} placeholder={`P·${String(panelIndex + 1).padStart(2, '0')}`} spellCheck={false}
        onChange={(e) => updatePanel((p) => ({ ...p, pid: e.target.value || undefined }))} />

      <div className="ce-lbl" style={{ marginTop: 12 }}>what's on it</div>
      <div className="ce-boxlist">
        {panel.boxes.map((b, i) => (
          <div key={i} className="ce-boxrow" onClick={() => selectBox(i)}>
            <span className="ce-boxicon">{b.kind === 'draw' ? '✎' : b.kind === 'art' ? '★' : 'T'}</span>
            <span className="ce-boxlbl">{boxLabel(b)}</span>
            <span className="ce-boxedit">edit →</span>
          </div>
        ))}
        {panel.boxes.length === 0 && <div className="ce-hint">no boxes yet</div>}
      </div>
      <div className="ce-addrow">
        <div className="ce-add" onClick={() => addBox('text')}>+ text box</div>
        <div className="ce-add" onClick={() => addBox('draw')}>+ drawing</div>
      </div>

      <Slider label="tilt the panel" min={-6} max={6} step={0.5} value={panel.rotate ?? 0} suffix="°"
        onChange={(v) => updatePanel((p) => ({ ...p, rotate: v || undefined }))} />
      <Slider label="panel width" min={180} max={STAGE_W_MAX} value={panel.w} suffix="px"
        onChange={(v) => updatePanel((p) => ({ ...p, w: v }))} />
      <Slider label="panel height" min={120} max={STAGE_H_MAX} value={panel.h} suffix="px"
        onChange={(v) => updatePanel((p) => ({ ...p, h: v }))} />

      <div className="ce-divider" />

      {/* arrival sentence */}
      <div className="ce-sentence">
        When Dash lands here, he{' '}
        <select style={PICK} value={a.pose ?? ''} onChange={(e) => setArr({ pose: e.target.value ? e.target.value as ArrivalDoc['pose'] : undefined })}>
          <option value="">just lands</option>
          {ARRIVAL_POSES.map((p) => <option key={p} value={p}>{POSE_WORD[p]}</option>)}
        </select>{' '}
        and says{' '}
        <input style={SAY} value={a.say ?? ''} placeholder="(nothing)" onChange={(e) => setArr({ say: e.target.value || undefined })} />{' '}
        with{' '}
        <select style={PICK} value={a.sfx ?? ''} onChange={(e) => setArr({ sfx: e.target.value ? e.target.value as ArrivalDoc['sfx'] : undefined })}>
          <option value="">no</option>
          {SFX_KINDS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>{' '}
        sound. He hangs out{' '}
        <select style={PICK} value={roof ? 'roof' : 'inside'} onChange={(e) => setSpot(e.target.value)}>
          <option value="roof">on the roof</option>
          <option value="inside">inside the panel</option>
        </select>.
      </div>

      <label className="ce-check">
        <input type="checkbox" checked={!!a.flourish} onChange={(e) => setArr({ flourish: e.target.checked || undefined })} />
        <span>make it a big entrance</span>
      </label>

      <details className="ce-fine">
        <summary>the fine print</summary>
        <label className="ce-check2">
          <input type="checkbox" checked={!!a.once} onChange={(e) => setArr({ once: e.target.checked || undefined })} />
          <span>strike this pose only once</span>
        </label>
        <div className="ce-frow"><span>revert after</span>
          <input type="number" value={a.revertMs ?? ''} placeholder="—" onChange={(e) => setArr({ revertMs: e.target.value === '' ? undefined : Number(e.target.value) })} /><span>ms</span></div>
        <div className="ce-frow"><span>face</span>
          <select value={a.face === -1 ? '-1' : a.face === 1 ? '1' : ''} onChange={(e) => setArr({ face: e.target.value === '' ? undefined : Number(e.target.value) as 1 | -1 })}>
            <option value="">auto</option><option value="1">right</option><option value="-1">left</option>
          </select></div>
        <div className="ce-frow"><span>on arrival, raise flag</span>
          <input type="text" value={a.setFlag ?? ''} placeholder="(none)" onChange={(e) => setArr({ setFlag: e.target.value || undefined })} /></div>
      </details>

      <div className="ce-divider" />

      <TravelChips panel={panel} actionNames={actionNames} updatePanel={updatePanel} />

      <div className="ce-remove" onClick={deletePanel}>✂ remove this whole panel</div>
    </div>
  )
}

function TravelChips({ panel, actionNames, updatePanel }: { panel: PanelDoc; actionNames: string[]; updatePanel: (fn: (p: PanelDoc) => PanelDoc) => void }) {
  const t = panel.travel ?? {}
  const allBuiltins = t.builtins === undefined
  const enabled = new Set(t.builtins ?? BUILTIN_MODES)
  const actionsOn = new Set(t.actions ?? [])
  const setTravel = (p: Partial<typeof t>) => updatePanel((pn) => {
    const next = { ...pn.travel, ...p }
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k]
    return { ...pn, travel: Object.keys(next).length ? next : undefined }
  })
  const toggleBuiltin = (m: (typeof BUILTIN_MODES)[number]) => {
    const nx = new Set(enabled)
    if (nx.has(m)) nx.delete(m); else nx.add(m)
    if (nx.size === 0) setTravel({ builtins: undefined })
    else if (nx.size === BUILTIN_MODES.length) setTravel({ builtins: undefined })
    else setTravel({ builtins: BUILTIN_MODES.filter((x) => nx.has(x)) })
  }
  const toggleAction = (name: string) => {
    const nx = new Set(actionsOn)
    if (nx.has(name)) nx.delete(name); else nx.add(name)
    setTravel({ actions: nx.size ? [...nx] : undefined })
  }

  return (
    <div>
      <div className="ce-lbl">he can get here by…</div>
      <div className="ce-chips">
        <div className={`ce-chip${allBuiltins ? ' on' : ''}`} onClick={() => setTravel({ builtins: undefined })}>anything (default)</div>
        {BUILTIN_MODES.map((m) => (
          <div key={m} className={`ce-chip${!allBuiltins && enabled.has(m) ? ' on' : ''}`} onClick={() => toggleBuiltin(m)}>{BUILTIN_INFO[m].label}</div>
        ))}
        {actionNames.map((name) => (
          <div key={name} className={`ce-chip dashed${actionsOn.has(name) ? ' on' : ''}`} onClick={() => toggleAction(name)}>{name}</div>
        ))}
      </div>
    </div>
  )
}

// ── text box ─────────────────────────────────────────────────────────────────
function TextBoxEditor({ box, updateBox, deleteBox }: { box: TextBox; updateBox: (fn: (b: BoxDoc) => BoxDoc) => void; deleteBox: () => void }) {
  const [selCh, setSelCh] = useState<Set<number>>(new Set())
  const [slider, setSlider] = useState(0)
  useEffect(() => { setSelCh(new Set()); setSlider(0) }, [box.text])

  const chars = [...box.text]
  const nonSpace = chars.filter((c) => /\S/.test(c)).length
  const allIdx = () => Array.from({ length: nonSpace }, (_, i) => i)
  const targets = () => (selCh.size ? [...selCh].filter((i) => i < nonSpace) : allIdx())
  const applyRots = (indices: number[], val: number | null) => updateBox((b) => {
    if (b.kind !== 'text') return b
    const arr: (number | null)[] = []
    for (let i = 0; i < nonSpace; i++) arr.push(b.charRots?.[i] ?? null)
    for (const i of indices) if (i < nonSpace) arr[i] = val
    return { ...b, charRots: arr.some((v) => v !== null) ? arr : undefined }
  })
  const set = (p: Partial<TextBox>) => updateBox((b) => ({ ...(b as TextBox), ...p }))

  // char chips: walk text, count non-space index
  let ns = -1
  return (
    <div className="ce-pad">
      <div className="ce-head"><span className="ce-title">THE WORDS</span></div>
      <textarea
        className="ce-words"
        rows={2}
        value={box.text}
        onChange={(e) => {
          // Trim charRots to the new non-space char count, else the validator
          // rejects the doc (length > count) and Save silently locks up.
          const text = e.target.value
          const ns = [...text].filter((c) => /\S/.test(c)).length
          updateBox((b) => {
            if (b.kind !== 'text') return b
            let charRots = b.charRots
            if (charRots && charRots.length > ns) {
              const cut = charRots.slice(0, ns)
              charRots = cut.some((v) => v !== null) ? cut : undefined
            }
            return { ...b, text, charRots }
          })
        }}
      />

      <div className="ce-row" style={{ marginTop: 9 }}>
        {FONTS.map((f) => (
          <div key={f.k} className={`ce-aa${(box.fam ?? 'hand') === f.k ? ' on' : ''}`} style={{ fontFamily: `${f.css},cursive` }} onClick={() => set({ fam: f.k })}>Aa</div>
        ))}
        <span style={{ width: 6 }} />
        <div className="ce-round" onClick={() => set({ size: Math.max(8, (box.size ?? 16) - 2) })}>−</div>
        <span className="ce-px">{box.size ?? 16}px</span>
        <div className="ce-round" onClick={() => set({ size: Math.min(80, (box.size ?? 16) + 2) })}>+</div>
      </div>

      <div className="ce-row" style={{ marginTop: 9 }}>
        <span className="ce-lbl2">highlighter</span>
        {HL_DOTS.map((h) => (
          <div key={h.k} className="ce-dot" style={{ background: h.sw, border: (box.hl ?? 'none') === h.k ? '2.5px solid #23211c' : '2px solid #c9c1a8' }}
            onClick={() => set({ hl: h.k === 'none' ? undefined : h.k })} />
        ))}
      </div>
      <div className="ce-row" style={{ marginTop: 9 }}>
        <span className="ce-lbl2">text color</span>
        {TEXT_COLORS.map((c) => (
          <div key={c} className="ce-dot" style={{ background: c, border: (box.color ?? '#1a1a1a') === c ? '2.5px solid #23211c' : '2px solid #c9c1a8' }}
            onClick={() => set({ color: c === '#1a1a1a' ? undefined : c })} />
        ))}
      </div>

      <Slider label="tilt the box" min={-15} max={15} value={box.rot ?? 0} suffix="°" onChange={(v) => set({ rot: v || undefined })} />

      <div className="ce-divider" />

      <div className="ce-lbl">tilt individual letters — tap the ones you want, then spin the dial (tap none to grab them all)</div>
      <div className="ce-chars">
        {chars.map((c, i) => {
          if (!/\S/.test(c)) return <span key={i} className="ce-charsp">&nbsp;</span>
          ns += 1
          const idx = ns
          const rot = box.charRots?.[idx] ?? 0
          const on = selCh.has(idx)
          return (
            <div key={i} className="ce-char" style={{ transform: `rotate(${rot}deg)`, border: on ? '1.5px solid #23211c' : '1.5px solid #d9d2bd', background: on ? 'rgba(255,210,63,.55)' : '#fff' }}
              onClick={() => setSelCh((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n })}>{c}</div>
          )
        })}
      </div>
      <div className="ce-row" style={{ marginTop: 6 }}>
        <input type="range" min={-30} max={30} value={slider} className="ce-range"
          onChange={(e) => { const v = Number(e.target.value); setSlider(v); applyRots(targets(), v) }} />
        <span className="ce-px">{slider}°</span>
      </div>
      <div className="ce-minirow">
        <div className="ce-mini" onClick={() => setSelCh(new Set(allIdx()))}>all</div>
        <div className="ce-mini" onClick={() => setSelCh(new Set())}>none</div>
        <div className="ce-mini dark" onClick={() => applyRots(targets(), Math.round(Math.random() * 24 - 12))}>scatter ✵</div>
        <div className="ce-mini yellow" onClick={() => { set({ charRots: undefined }); setSlider(0) }}>make them behave ↺</div>
      </div>

      <label className="ce-check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={!!box.note} onChange={(e) => set({ note: e.target.checked || undefined })} />
        <span>put it on a little card</span>
      </label>

      <div className="ce-remove" onClick={deleteBox}>✂ remove this box</div>
    </div>
  )
}

// ── draw box ─────────────────────────────────────────────────────────────────
function DrawBoxEditor({ box, updateBox, deleteBox }: { box: DrawBox; updateBox: (fn: (b: BoxDoc) => BoxDoc) => void; deleteBox: () => void }) {
  const set = (p: Partial<DrawBox>) => updateBox((b) => ({ ...(b as DrawBox), ...p }))
  return (
    <div className="ce-pad">
      <div className="ce-head"><span className="ce-title">THE DRAWING</span></div>
      <div className="ce-note">Flip to <b>✏️ draw</b> at the top, then scribble right inside this box on the page.</div>
      <div className="ce-lbl" style={{ marginTop: 12 }}>ink</div>
      <div className="ce-row">
        {INK_COLORS.map((c) => (
          <div key={c} className="ce-dot big" style={{ background: c, border: (box.strokeColor ?? '#1a1a1a') === c ? '2.5px solid #23211c' : '2px solid #c9c1a8' }}
            onClick={() => set({ strokeColor: c === '#1a1a1a' ? undefined : c })} />
        ))}
      </div>
      <div className="ce-lbl" style={{ marginTop: 12 }}>nib</div>
      <div className="ce-row">
        {NIBS.map((n) => (
          <div key={n.v} className={`ce-mini${Math.abs((box.strokeW ?? 3) - n.v) < 0.6 ? ' on' : ''}`} onClick={() => set({ strokeW: n.v })}>{n.n}</div>
        ))}
      </div>
      <div className="ce-row" style={{ marginTop: 14 }}>
        <div className="ce-mini2" onClick={() => set({ strokes: [] })}>erase all ({box.strokes.length})</div>
      </div>
      <div className="ce-remove" onClick={deleteBox}>✂ remove this box</div>
    </div>
  )
}

// ── art box ──────────────────────────────────────────────────────────────────
function ArtBoxEditor({ box, updateBox, deleteBox }: { box: ArtBox; updateBox: (fn: (b: BoxDoc) => BoxDoc) => void; deleteBox: () => void }) {
  const set = (p: Partial<ArtBox>) => updateBox((b) => ({ ...(b as ArtBox), ...p }))
  const num = (k: 'x' | 'y' | 'w' | 'h') => (
    <label className="ce-frow" key={k}><span>{k}</span>
      <input type="number" value={box[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<ArtBox>)} /></label>
  )
  return (
    <div className="ce-pad">
      <div className="ce-head"><span className="ce-title">THE ART</span><span className="ce-sub">{box.component}</span></div>
      <div className="ce-hint" style={{ marginBottom: 8 }}>art swaps in the Dojo, later</div>
      <div className="ce-fgrid">{(['x', 'y', 'w', 'h'] as const).map(num)}</div>
      <div className="ce-frow" style={{ marginTop: 8 }}><span>show if flag</span>
        <input type="text" value={box.showIfFlag ?? ''} placeholder="(always)" onChange={(e) => set({ showIfFlag: e.target.value || undefined })} /></div>
      <div className="ce-remove" onClick={deleteBox}>✂ remove this box</div>
    </div>
  )
}

// ── shared bits ──────────────────────────────────────────────────────────────
const STAGE_W_MAX = 920
const STAGE_H_MAX = 660
const POSE_WORD: Record<(typeof ARRIVAL_POSES)[number], string> = { fight: 'fights', think: 'thinks', spray: 'sprays', cheer: 'cheers' }

function boxLabel(b: BoxDoc): string {
  if (b.kind === 'draw') return `drawing · ${b.strokes.length} stroke${b.strokes.length === 1 ? '' : 's'}`
  if (b.kind === 'art') return `art · ${b.component}`
  return b.text.replace(/\n/g, ' ') || 'words'
}

function Slider({ label, min, max, step, value, suffix, onChange }: { label: string; min: number; max: number; step?: number; value: number; suffix: string; onChange: (v: number) => void }): ReactNode {
  return (
    <div className="ce-slider">
      <span className="ce-lbl2">{label}</span>
      <input type="range" min={min} max={max} step={step ?? 1} value={value} className="ce-range" onChange={(e) => onChange(Number(e.target.value))} />
      <span className="ce-px">{value}{suffix}</span>
    </div>
  )
}
