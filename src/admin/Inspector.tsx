// Right-hand inspector. For a selected panel: geometry, presentation, Dash's
// arrival + travel config, and a read-only box count. The per-box whiteboard
// editor is coming with the admin rebuild (Part 2) — for now content is edited
// by re-running the migration or hand-editing the doc.
import {
  ARRIVAL_POSES, BUILTIN_MODES, SFX_KINDS,
  type ArrivalDoc, type CoverDoc, type PanelDoc,
} from '../notebook/doc/docTypes'
import { CheckField, NumField, Section, SelectField, TextField } from './fields'

interface Props {
  kind: 'cover' | 'page'
  cover: CoverDoc
  panel: PanelDoc | null
  actionNames: string[]
  registryKeys: string[]
  updateCover: (fn: (c: CoverDoc) => CoverDoc) => void
  updatePanel: (fn: (p: PanelDoc) => PanelDoc) => void
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

function PanelInspector({ panel, actionNames, updatePanel }: Props & { panel: PanelDoc }) {
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
        <TextField label="pid tag" value={panel.pid ?? ''} onChange={(v) => updatePanel((p) => ({ ...p, pid: v || undefined }))} placeholder="P·01" />
      </Section>

      <Section title="Content">
        <div className="muted" style={{ fontSize: 12 }}>boxes: {panel.boxes.length} (whiteboard editor coming)</div>
      </Section>

      <ArrivalForm panel={panel} updatePanel={updatePanel} />
      <TravelForm panel={panel} actionNames={actionNames} updatePanel={updatePanel} />
    </div>
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
