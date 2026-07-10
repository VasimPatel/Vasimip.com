// Right-hand inspector. For a selected panel: geometry, presentation, the
// ordered element list (with per-type mini-forms) and Dash's arrival + travel
// config. For the cover selection: the three cover text fields.
import { useState } from 'react'
import {
  ARRIVAL_POSES, BUILTIN_MODES, ELEMENT_TYPES, SFX_KINDS,
  type ArrivalDoc, type CoverDoc, type ElementDoc, type ElementType, type JsonValue, type PanelDoc, type PlaceDoc,
} from '../notebook/doc/docTypes'
import { CheckField, Field, NumField, Section, SelectField, TextField } from './fields'

interface Props {
  kind: 'cover' | 'page'
  cover: CoverDoc
  panel: PanelDoc | null
  actionNames: string[]
  registryKeys: string[]
  updateCover: (fn: (c: CoverDoc) => CoverDoc) => void
  updatePanel: (fn: (p: PanelDoc) => PanelDoc) => void
}

const DEFAULT_ELEMENTS: Record<ElementType, () => ElementDoc> = {
  heading: () => ({ type: 'heading', text: 'HEADING', size: 20 }),
  text: () => ({ type: 'text', text: 'text', size: 16 }),
  caption: () => ({ type: 'caption', text: 'caption' }),
  note: () => ({ type: 'note', text: 'note' }),
  placeholder: () => ({ type: 'placeholder', text: 'placeholder' }),
  checklist: () => ({ type: 'checklist', items: ['item one'] }),
  custom: () => ({ type: 'custom', component: '' }),
}

export default function Inspector(props: Props) {
  if (props.kind === 'cover') return <CoverInspector cover={props.cover} updateCover={props.updateCover} />
  if (!props.panel) return <div className="empty">select a panel on the canvas</div>
  return <PanelInspector {...props} panel={props.panel} />
}

function CoverInspector({ cover, updateCover }: { cover: CoverDoc; updateCover: (fn: (c: CoverDoc) => CoverDoc) => void }) {
  return (
    <div>
      <Section title="Cover">
        <TextField label="name" value={cover.name} onChange={(v) => updateCover((c) => ({ ...c, name: v }))} />
        <TextField label="subject" value={cover.subject} onChange={(v) => updateCover((c) => ({ ...c, subject: v }))} />
        <TextField label="snark" value={cover.snark} onChange={(v) => updateCover((c) => ({ ...c, snark: v }))} area />
      </Section>
    </div>
  )
}

function PanelInspector({ panel, actionNames, registryKeys, updatePanel }: Props & { panel: PanelDoc }) {
  const [openEl, setOpenEl] = useState<number | null>(null)
  const [addType, setAddType] = useState<ElementType>('heading')

  const setEl = (i: number, fn: (e: ElementDoc) => ElementDoc) =>
    updatePanel((p) => ({ ...p, elements: p.elements.map((e, idx) => (idx === i ? fn(e) : e)) }))
  const moveEl = (i: number, dir: -1 | 1) => updatePanel((p) => {
    const j = i + dir
    if (j < 0 || j >= p.elements.length) return p
    const els = p.elements.slice()
    ;[els[i], els[j]] = [els[j], els[i]]
    return { ...p, elements: els }
  })
  const removeEl = (i: number) => updatePanel((p) => ({ ...p, elements: p.elements.filter((_, idx) => idx !== i) }))
  const addEl = () => updatePanel((p) => ({ ...p, elements: [...p.elements, DEFAULT_ELEMENTS[addType]()] }))

  return (
    <div>
      <Section title="Geometry">
        <div className="row">
          <NumField label="x" value={panel.x} onChange={(v) => updatePanel((p) => ({ ...p, x: v ?? 0 }))} />
          <NumField label="y" value={panel.y} onChange={(v) => updatePanel((p) => ({ ...p, y: v ?? 0 }))} />
        </div>
        <div className="row">
          <NumField label="w" value={panel.w} onChange={(v) => updatePanel((p) => ({ ...p, w: v ?? 0 }))} />
          <NumField label="h" value={panel.h} onChange={(v) => updatePanel((p) => ({ ...p, h: v ?? 0 }))} />
        </div>
        <div className="row">
          <NumField label="anchor Δx" value={panel.anchor.dx} onChange={(v) => updatePanel((p) => ({ ...p, anchor: { ...p.anchor, dx: v ?? 0 } }))} />
          <NumField label="anchor Δy" value={panel.anchor.dy} onChange={(v) => updatePanel((p) => ({ ...p, anchor: { ...p.anchor, dy: v ?? 0 } }))} />
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: -4, marginBottom: 4 }}>
          (→ {panel.x + panel.anchor.dx}, {panel.y + panel.anchor.dy})
        </div>
        <NumField label="rotate°" value={panel.rotate} onChange={(v) => updatePanel((p) => ({ ...p, rotate: v }))} step={0.1} />
      </Section>

      <Section title="Presentation">
        <SelectField label="sketch" value={panel.sketch ?? 'a'} options={['a', 'b', 'c']} onChange={(v) => updatePanel((p) => ({ ...p, sketch: v }))} />
        <TextField label="padding" value={panel.padding ?? ''} onChange={(v) => updatePanel((p) => ({ ...p, padding: v || undefined }))} placeholder="16px 22px" />
        <SelectField label="layout" value={panel.layout ?? 'none'} options={['none', 'flow']} onChange={(v) => updatePanel((p) => ({ ...p, layout: v === 'none' ? undefined : v }))} />
        {panel.layout === 'flow' && <NumField label="gap" value={panel.gap} onChange={(v) => updatePanel((p) => ({ ...p, gap: v }))} />}
      </Section>

      <Section title="Elements">
        {panel.elements.map((el, i) => (
          <div key={i}>
            <div className="el-row" onClick={() => setOpenEl(openEl === i ? null : i)}>
              <span className="badge">{el.type}</span>
              <span className="nm">{elementSummary(el)}</span>
              <button className="btn mini" onClick={(e) => { e.stopPropagation(); moveEl(i, -1) }} disabled={i === 0}>▲</button>
              <button className="btn mini" onClick={(e) => { e.stopPropagation(); moveEl(i, 1) }} disabled={i === panel.elements.length - 1}>▼</button>
              <button className="btn mini" onClick={(e) => { e.stopPropagation(); removeEl(i) }}>✕</button>
            </div>
            {openEl === i && (
              <div className="el-body">
                <ElementForm key={i} el={el} onChange={(fn) => setEl(i, fn)} registryKeys={registryKeys} />
                <SharedElementForm el={el} onChange={(fn) => setEl(i, fn)} />
              </div>
            )}
          </div>
        ))}
        <div className="row" style={{ marginTop: 6 }}>
          <select value={addType} onChange={(e) => setAddType(e.target.value as ElementType)}>
            {ELEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn" onClick={addEl}>+ element</button>
        </div>
      </Section>

      <ArrivalForm panel={panel} updatePanel={updatePanel} />
      <TravelForm panel={panel} actionNames={actionNames} updatePanel={updatePanel} />
    </div>
  )
}

// ── element summaries + per-type forms ──────────────────────────────────────
function elementSummary(el: ElementDoc): string {
  switch (el.type) {
    case 'heading': case 'text': case 'caption': case 'note': case 'placeholder': return el.text
    case 'checklist': return el.items.join(', ')
    case 'custom': return el.component || '(no component)'
  }
}

function ElementForm({ el, onChange, registryKeys }: {
  el: ElementDoc
  onChange: (fn: (e: ElementDoc) => ElementDoc) => void
  registryKeys: string[]
}) {
  const patch = <T extends ElementDoc>(p: Partial<T>) => onChange((e) => ({ ...e, ...p } as ElementDoc))
  switch (el.type) {
    case 'heading':
      return (
        <>
          <TextField label="text" value={el.text} onChange={(v) => patch({ text: v })} />
          <NumField label="size" value={el.size} onChange={(v) => patch({ size: v ?? 16 })} />
          <SelectField label="highlight" value={el.highlight ?? 'none'} options={['none', 'yellow', 'pink']} onChange={(v) => patch({ highlight: v === 'none' ? undefined : v })} />
          <TextField label="prefix" value={el.prefix ?? ''} onChange={(v) => patch({ prefix: v || undefined })} />
          <TextField label="suffix" value={el.suffix ?? ''} onChange={(v) => patch({ suffix: v || undefined })} />
          <NumField label="rotate°" value={el.rotate} onChange={(v) => patch({ rotate: v })} step={0.5} />
        </>
      )
    case 'text':
      return (
        <>
          <TextField label="text" value={el.text} onChange={(v) => patch({ text: v })} area />
          <NumField label="size" value={el.size} onChange={(v) => patch({ size: v ?? 16 })} />
          <SelectField label="tone" value={el.tone ?? 'ink'} options={['ink', 'muted', 'faint']} onChange={(v) => patch({ tone: v })} />
          <NumField label="lineHeight" value={el.lineHeight} onChange={(v) => patch({ lineHeight: v })} step={0.05} />
        </>
      )
    case 'caption':
      return (
        <>
          <TextField label="text" value={el.text} onChange={(v) => patch({ text: v })} area />
          <NumField label="size" value={el.size} onChange={(v) => patch({ size: v })} />
        </>
      )
    case 'note':
      return (
        <>
          <TextField label="text" value={el.text} onChange={(v) => patch({ text: v })} area rows={4} />
          <NumField label="size" value={el.size} onChange={(v) => patch({ size: v })} />
          <NumField label="lineHeight" value={el.lineHeight} onChange={(v) => patch({ lineHeight: v })} step={0.05} />
        </>
      )
    case 'placeholder':
      return <TextField label="label" value={el.text} onChange={(v) => patch({ text: v })} />
    case 'checklist':
      return <ItemsEditor key="items" items={el.items} onChange={(items) => patch({ items })} />
    case 'custom':
      return (
        <>
          <Field label="component">
            <select value={el.component} onChange={(e) => patch({ component: e.target.value })}>
              <option value="">— pick —</option>
              {registryKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <PropsEditor key="props" value={el.props} onChange={(props) => patch({ props })} />
        </>
      )
  }
}

function SharedElementForm({ el, onChange }: { el: ElementDoc; onChange: (fn: (e: ElementDoc) => ElementDoc) => void }) {
  const setShared = (p: Partial<ElementDoc>) => onChange((e) => ({ ...e, ...p } as ElementDoc))
  const place = el.place
  const setPlace = (k: keyof PlaceDoc, v: number | undefined) => {
    const next: PlaceDoc = { ...place, [k]: v }
    if (v === undefined) delete next[k]
    setShared({ place: Object.keys(next).length ? next : undefined })
  }
  return (
    <div className="sec">
      <div className="sec-h">placement</div>
      <div className="row">
        <NumField label="left" value={place?.left} onChange={(v) => setPlace('left', v)} placeholder="—" />
        <NumField label="right" value={place?.right} onChange={(v) => setPlace('right', v)} placeholder="—" />
      </div>
      <div className="row">
        <NumField label="top" value={place?.top} onChange={(v) => setPlace('top', v)} placeholder="—" />
        <NumField label="bottom" value={place?.bottom} onChange={(v) => setPlace('bottom', v)} placeholder="—" />
      </div>
      <NumField label="width" value={place?.width} onChange={(v) => setPlace('width', v)} placeholder="—" />
      <CheckField label="grow (flex:1)" checked={!!el.grow} onChange={(v) => setShared({ grow: v || undefined })} />
      <TextField label="showIfFlag" value={el.showIfFlag ?? ''} onChange={(v) => setShared({ showIfFlag: v || undefined })} />
    </div>
  )
}

function ItemsEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [text, setText] = useState(items.join('\n'))
  return (
    <Field label="items">
      <textarea
        rows={4}
        value={text}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value.split('\n').filter((l) => l.length > 0)) }}
      />
    </Field>
  )
}

function PropsEditor({ value, onChange }: { value: Record<string, JsonValue> | undefined; onChange: (p: Record<string, JsonValue> | undefined) => void }) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : '')
  const [err, setErr] = useState<string | null>(null)
  return (
    <Field label="props JSON">
      <div style={{ flex: 1 }}>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => {
            const t = e.target.value
            setText(t)
            if (t.trim() === '') { setErr(null); onChange(undefined); return }
            try {
              const parsed = JSON.parse(t)
              if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { setErr('must be an object'); return }
              setErr(null); onChange(parsed)
            } catch (e2) { setErr((e2 as Error).message) }
          }}
        />
        {err && <div className="err-line">{err}</div>}
      </div>
    </Field>
  )
}

// ── arrival + travel ────────────────────────────────────────────────────────
function ArrivalForm({ panel, updatePanel }: { panel: PanelDoc; updatePanel: (fn: (p: PanelDoc) => PanelDoc) => void }) {
  const a = panel.arrival ?? {}
  const set = (p: Partial<ArrivalDoc>) => updatePanel((pn) => {
    const next: ArrivalDoc = { ...pn.arrival, ...p }
    for (const k of Object.keys(next) as (keyof ArrivalDoc)[]) if (next[k] === undefined) delete next[k]
    return { ...pn, arrival: Object.keys(next).length ? next : undefined }
  })
  const flourish = a.flourish === undefined ? 'default' : a.flourish ? 'on' : 'off'
  return (
    <Section title="Dash · arrival">
      <SelectField label="pose" value={a.pose ?? 'none'} options={['none', ...ARRIVAL_POSES]} onChange={(v) => set({ pose: v === 'none' ? undefined : v as ArrivalDoc['pose'] })} />
      <SelectField label="face" value={a.face === -1 ? '-1' : a.face === 1 ? '1' : 'default'} options={['default', '1', '-1']} onChange={(v) => set({ face: v === 'default' ? undefined : (Number(v) as 1 | -1) })} />
      <CheckField label="once (one-shot)" checked={!!a.once} onChange={(v) => set({ once: v || undefined })} />
      <NumField label="revertMs" value={a.revertMs} onChange={(v) => set({ revertMs: v })} />
      <TextField label="say" value={a.say ?? ''} onChange={(v) => set({ say: v || undefined })} />
      <SelectField label="sfx" value={a.sfx ?? 'none'} options={['none', ...SFX_KINDS]} onChange={(v) => set({ sfx: v === 'none' ? undefined : v as ArrivalDoc['sfx'] })} />
      <TextField label="setFlag" value={a.setFlag ?? ''} onChange={(v) => set({ setFlag: v || undefined })} />
      <SelectField label="flourish" value={flourish} options={['default', 'on', 'off']} onChange={(v) => set({ flourish: v === 'default' ? undefined : v === 'on' })} />
    </Section>
  )
}

function TravelForm({ panel, actionNames, updatePanel }: { panel: PanelDoc; actionNames: string[]; updatePanel: (fn: (p: PanelDoc) => PanelDoc) => void }) {
  const t = panel.travel ?? {}
  const set = (p: Partial<typeof t>) => updatePanel((pn) => {
    const next = { ...pn.travel, ...p }
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k]
    return { ...pn, travel: Object.keys(next).length ? next : undefined }
  })
  const allBuiltins = t.builtins === undefined
  const enabled = new Set(t.builtins ?? BUILTIN_MODES)
  return (
    <Section title="Dash · travel pool">
      <CheckField
        label="all builtins (default)"
        checked={allBuiltins}
        onChange={(v) => set({ builtins: v ? undefined : [...BUILTIN_MODES] })}
      />
      {!allBuiltins && (
        <div className="chips">
          {BUILTIN_MODES.map((m) => (
            <label key={m} className={`chip${enabled.has(m) ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={enabled.has(m)}
                onChange={(e) => {
                  const next = new Set(enabled)
                  if (e.target.checked) next.add(m); else next.delete(m)
                  set({ builtins: BUILTIN_MODES.filter((x) => next.has(x)) })
                }}
              />
              {m}
            </label>
          ))}
        </div>
      )}
      {actionNames.length > 0 && (
        <>
          <div className="sec-h" style={{ marginTop: 8 }}>custom actions</div>
          <div className="chips">
            {actionNames.map((name) => {
              const on = (t.actions ?? []).includes(name)
              return (
                <label key={name} className={`chip${on ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const cur = new Set(t.actions ?? [])
                      if (e.target.checked) cur.add(name); else cur.delete(name)
                      set({ actions: cur.size ? [...cur] : undefined })
                    }}
                  />
                  {name}
                </label>
              )
            })}
          </div>
          <NumField label="actionWeight" value={t.actionWeight} onChange={(v) => set({ actionWeight: v })} />
        </>
      )}
    </Section>
  )
}
