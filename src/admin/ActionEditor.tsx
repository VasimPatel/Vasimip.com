// The Actions editor. Left rail: two sections — the 11 read-only BUILT-INS
// (listed / testable / forkable) above the CUSTOM action library (add/rename/
// duplicate/delete). Right pane: a read-only detail for a selected built-in
// (blurb + geometry gates + ▶ Test + Fork→custom), or the full custom editor —
// the `when` gate, an ordered typed step list, a live compile summary, ▶ Test,
// and a cue TIMELINE recomputed from the same compile result as the summary.
import { useState } from 'react'
import {
  EASE_NAMES, FX_KINDS, POSES, SFX_KINDS, STEP_KINDS, BUILTIN_MODES,
  type ActionDoc, type ActionWhen, type BuiltinMode, type EaseName, type MoveTarget, type Step, type StepKind,
} from '../notebook/doc/docTypes'
import { compileAction, type ActionCtx, type Cue, type CompiledCue, type CuePatch } from '../notebook/doc/actions'
import { BUILTIN_INFO } from '../notebook/doc/builtinInfo'
import type { PanelGeom } from '../notebook/types'
import { NumField, SelectField, TextField } from './fields'

interface Props {
  actions: Record<string, ActionDoc>
  selected: string | null
  onSelect: (name: string | null) => void
  updateActions: (fn: (a: Record<string, ActionDoc>) => Record<string, ActionDoc>) => void
  contextPanel: PanelGeom
  onTest: (name: string) => void
  onTestBuiltin: (mode: BuiltinMode) => void
}

const STEP_DEFAULTS: Record<StepKind, () => Step> = {
  pose: () => ({ do: 'pose', pose: 'idle' }),
  move: () => ({ do: 'move', to: { at: 'anchor' } }),
  say: () => ({ do: 'say', text: '…' }),
  sfx: () => ({ do: 'sfx', kind: 'hop' }),
  fx: () => ({ do: 'fx', kind: 'shake' }),
  cam: () => ({ do: 'cam', on: 'dash' }),
  camClear: () => ({ do: 'camClear' }),
  wait: () => ({ do: 'wait', ms: 300 }),
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}

export default function ActionEditor({ actions, selected, onSelect, updateActions, contextPanel, onTest, onTestBuiltin }: Props) {
  const names = Object.keys(actions)
  const sel = selected && actions[selected] ? selected : null
  const [builtinSel, setBuiltinSel] = useState<BuiltinMode | null>(null)

  const pickCustom = (name: string) => { setBuiltinSel(null); onSelect(name) }
  const pickBuiltin = (mode: BuiltinMode) => { onSelect(null); setBuiltinSel(mode) }

  const addAction = () => {
    const name = uniqueName('action', new Set(names))
    updateActions((a) => ({ ...a, [name]: { steps: [] } }))
    pickCustom(name)
  }
  const duplicate = (name: string) => {
    const copy = uniqueName(name + 'Copy', new Set(names))
    updateActions((a) => ({ ...a, [copy]: JSON.parse(JSON.stringify(a[name])) }))
    pickCustom(copy)
  }
  const remove = (name: string) => {
    if (!window.confirm('Delete action "' + name + '"?')) return
    updateActions((a) => { const n = { ...a }; delete n[name]; return n })
    if (sel === name) onSelect(null)
  }
  const rename = (from: string, to: string) => {
    if (!to || to === from || actions[to]) return
    updateActions((a) => {
      const out: Record<string, ActionDoc> = {}
      for (const k of Object.keys(a)) out[k === from ? to : k] = a[k]
      return out
    })
    onSelect(to)
  }
  const updateSel = (fn: (d: ActionDoc) => ActionDoc) => {
    if (!sel) return
    updateActions((a) => ({ ...a, [sel]: fn(a[sel]) }))
  }
  // Fork a built-in's forkable template into a new editable custom action.
  const fork = (mode: BuiltinMode) => {
    const name = uniqueName(mode, new Set(names))
    const steps: Step[] = JSON.parse(JSON.stringify(BUILTIN_INFO[mode].template))
    updateActions((a) => ({ ...a, [name]: { steps } }))
    pickCustom(name)
  }

  return (
    <div className="action-editor">
      <div className="action-list">
        <div className="rail-sec">built-in <span className="lock">🔒</span></div>
        {BUILTIN_MODES.map((mode) => (
          <div key={mode} className={`pitem${builtinSel === mode ? ' active' : ''}`} onClick={() => pickBuiltin(mode)}>
            <span className="nm">{BUILTIN_INFO[mode].label}</span>
          </div>
        ))}

        <div className="rail-sec">custom<span className="grow" /><button className="btn mini" onClick={addAction}>+ new</button></div>
        {names.length === 0 && <div className="empty">no custom actions yet</div>}
        {names.map((name) => (
          <div key={name} className={`pitem${sel === name ? ' active' : ''}`} onClick={() => pickCustom(name)}>
            <span className="nm">{name}</span>
            <button className="btn mini" onClick={(e) => { e.stopPropagation(); duplicate(name) }} title="duplicate">⧉</button>
            <button className="btn mini" onClick={(e) => { e.stopPropagation(); remove(name) }} title="delete">✕</button>
          </div>
        ))}
      </div>

      <div className="action-detail">
        {builtinSel ? (
          <BuiltinDetail mode={builtinSel} onTest={onTestBuiltin} onFork={fork} />
        ) : !sel ? (
          <div className="empty">select a built-in, or create/pick a custom action</div>
        ) : (
          <ActionDetail
            key={sel}
            name={sel}
            def={actions[sel]}
            contextPanel={contextPanel}
            onRename={rename}
            onTest={onTest}
            update={updateSel}
          />
        )}
      </div>
    </div>
  )
}

function BuiltinDetail({ mode, onTest, onFork }: {
  mode: BuiltinMode
  onTest: (mode: BuiltinMode) => void
  onFork: (mode: BuiltinMode) => void
}) {
  const info = BUILTIN_INFO[mode]
  return (
    <div>
      <div className="detail-head">
        <span className="builtin-title">{info.label} <span className="lock">🔒</span></span>
        <span className="grow" />
        <button className="btn" onClick={() => onFork(mode)} title="deep-clone this choreography into an editable custom action">Fork → custom</button>
        <button className="btn primary" onClick={() => onTest(mode)}>▶ Test</button>
      </div>
      <p className="builtin-blurb">{info.blurb}</p>
      <div className="gates-chip" title="when travel() may pick this mode"><b>gates</b> {info.gates}</div>
      <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        Built-ins are read-only. Fork to get an editable copy of an approximation of this
        choreography — the tuned original lives in the engine.
      </div>
    </div>
  )
}

function ActionDetail({ name, def, contextPanel, onRename, onTest, update }: {
  name: string
  def: ActionDoc
  contextPanel: PanelGeom
  onRename: (from: string, to: string) => void
  onTest: (name: string) => void
  update: (fn: (d: ActionDoc) => ActionDoc) => void
}) {
  const [nameDraft, setNameDraft] = useState(name)
  const [openStep, setOpenStep] = useState<number | null>(null)

  const ctx: ActionCtx = {
    from: { x: 0, y: 300 },
    fromPanel: contextPanel,
    toPanel: contextPanel,
    anchor: { x: contextPanel.ax - 52, y: contextPanel.ay - 113 },
    dir: 1,
  }
  const compiled = compileAction(def, ctx)
  const summary = 'error' in compiled
    ? { err: compiled.error }
    : { ms: compiled.total, cues: compiled.cues.length }

  const setWhen = (p: Partial<ActionWhen>) => update((d) => {
    const next: ActionWhen = { ...d.when, ...p }
    for (const k of Object.keys(next) as (keyof ActionWhen)[]) if (next[k] === undefined) delete next[k]
    return { ...d, when: Object.keys(next).length ? next : undefined }
  })
  const setStep = (i: number, fn: (s: Step) => Step) => update((d) => ({ ...d, steps: d.steps.map((s, idx) => (idx === i ? fn(s) : s)) }))
  const moveStep = (i: number, dir: -1 | 1) => update((d) => {
    const j = i + dir
    if (j < 0 || j >= d.steps.length) return d
    const s = d.steps.slice()
    ;[s[i], s[j]] = [s[j], s[i]]
    return { ...d, steps: s }
  })
  const removeStep = (i: number) => update((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }))
  const [addKind, setAddKind] = useState<StepKind>('move')
  const addStep = () => update((d) => ({ ...d, steps: [...d.steps, STEP_DEFAULTS[addKind]()] }))

  const openStepRow = (i: number) => {
    setOpenStep(i)
    document.getElementById('astep-' + i)?.scrollIntoView({ block: 'nearest' })
  }

  const w = def.when ?? {}
  return (
    <div>
      <div className="detail-head">
        <input
          className="name-input"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => { if (nameDraft !== name) onRename(name, nameDraft) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <span className="grow" />
        <span className={'err' in summary ? 'err-line' : 'muted'}>
          {'err' in summary ? '⚠ ' + summary.err : `~${(summary.ms / 1000).toFixed(1)}s, ${summary.cues} cues`}
        </span>
        <button className="btn primary" onClick={() => onTest(name)}>▶ Test</button>
      </div>

      <details className="when-box">
        <summary>when (gate)</summary>
        <div className="row">
          <NumField label="minDist" value={w.minDist} onChange={(v) => setWhen({ minDist: v })} />
          <NumField label="maxDist" value={w.maxDist} onChange={(v) => setWhen({ maxDist: v })} />
        </div>
        <div className="row">
          <NumField label="minHoriz" value={w.minHoriz} onChange={(v) => setWhen({ minHoriz: v })} />
          <NumField label="minVert" value={w.minVert} onChange={(v) => setWhen({ minVert: v })} />
        </div>
        <SelectField label="vert" value={w.vert ?? 'any'} options={['any', 'up', 'down']} onChange={(v) => setWhen({ vert: v === 'any' ? undefined : v })} />
        <TextField
          label="fromPanel"
          value={(w.fromPanel ?? []).join(',')}
          placeholder="e.g. 0,2"
          onChange={(v) => {
            const arr = v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
            setWhen({ fromPanel: arr.length ? arr : undefined })
          }}
        />
      </details>

      <div className="rail-sec">Steps ({def.steps.length})</div>
      {def.steps.map((step, i) => (
        <div key={i} id={'astep-' + i} className={`step-row${openStep === i ? ' hot' : ''}`}>
          <div className="row" style={{ alignItems: 'center' }}>
            <select value={step.do} onChange={(e) => setStep(i, () => STEP_DEFAULTS[e.target.value as StepKind]())}>
              {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span className="grow" />
            <button className="btn mini" onClick={() => moveStep(i, -1)} disabled={i === 0}>▲</button>
            <button className="btn mini" onClick={() => moveStep(i, 1)} disabled={i === def.steps.length - 1}>▼</button>
            <button className="btn mini" onClick={() => removeStep(i)}>✕</button>
          </div>
          <StepForm step={step} onChange={(fn) => setStep(i, fn)} />
        </div>
      ))}
      <div className="row" style={{ marginTop: 6 }}>
        <select value={addKind} onChange={(e) => setAddKind(e.target.value as StepKind)}>
          {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className="btn" onClick={addStep}>+ step</button>
      </div>

      <div className="rail-sec">Timeline</div>
      {'error' in compiled
        ? <div className="err-line">⚠ {compiled.error}</div>
        : <CueTimeline cues={compiled.cues} total={compiled.total} openStep={openStep} onOpen={openStepRow} />}
    </div>
  )
}

// ── cue timeline ─────────────────────────────────────────────────────────────
type Marker = { icon: string; label: string; title: string }

/** Classify a non-span cue into a typed timeline marker, or null to omit
 *  (cleanup patches like {hopping:false} / {shakeOn:false} carry no meaning). */
function markerFor(cue: Cue): Marker | null {
  if ('finish' in cue) return { icon: '✓', label: 'finish', title: 'finish (land + idle)' }
  if ('sfx' in cue) return { icon: '♪', label: cue.sfx, title: 'sfx: ' + cue.sfx }
  const p = cue.patch as CuePatch
  if (p.react != null) return { icon: '💬', label: trunc(p.react, 12), title: 'say: ' + p.react }
  if (p.pose) return { icon: '▮', label: p.pose, title: 'pose: ' + p.pose }
  if (p.camo) return { icon: '🎥', label: 'cam', title: 'camera focus' }
  if (p.shakeOn || p.pageJit || p.smokeOn || p.crackOn || (p.pageShove ?? 0)) return { icon: '⚡', label: 'fx', title: 'effect pulse' }
  return null
}

const isSpan = (e: CompiledCue): boolean =>
  e.spanMs != null && 'patch' in e.cue && (e.cue.patch as CuePatch).dx !== undefined

function trunc(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + '…' : s }

function CueTimeline({ cues, total, openStep, onOpen }: {
  cues: CompiledCue[]
  total: number
  openStep: number | null
  onOpen: (i: number) => void
}) {
  const T = Math.max(1, total)
  const ticks: number[] = []
  for (let ms = 0; ms <= total; ms += 500) ticks.push(ms)

  return (
    <div className="cue-strip">
      <div className="cue-ruler">
        {ticks.map((ms) => (
          <div key={ms} className="cue-tick" style={{ left: (ms / T) * 100 + '%' }}>
            {ms % 1000 === 0 && <span className="cue-tlabel">{(ms / 1000).toFixed(0)}s</span>}
          </div>
        ))}
      </div>
      <div className="cue-lane">
        {cues.map((e, k) => {
          const auto = e.step == null
          const clickable = e.step != null
          const hot = openStep != null && e.step === openStep
          const onClick = clickable ? () => onOpen(e.step!) : undefined
          if (isSpan(e)) {
            const p = (e.cue as { patch: CuePatch }).patch
            const left = (e.t / T) * 100
            const width = Math.max(1.5, ((e.spanMs ?? 0) / T) * 100)
            return (
              <div
                key={k}
                className={`cue-span${auto ? ' auto' : ''}${hot ? ' hot' : ''}${clickable ? ' clk' : ''}`}
                style={{ left: left + '%', width: width + '%' }}
                title={`move → ${p.pose ?? 'walk'} (${Math.round(e.spanMs ?? 0)}ms)` + (auto ? ' · auto' : '')}
                onClick={onClick}
              >
                <span className="cue-span-lbl">{p.pose ?? 'move'}</span>
              </div>
            )
          }
          const m = markerFor(e.cue)
          if (!m) return null
          return (
            <div
              key={k}
              className={`cue-mark${auto ? ' auto' : ''}${hot ? ' hot' : ''}${clickable ? ' clk' : ''}`}
              style={{ left: (e.t / T) * 100 + '%' }}
              title={m.title + (auto ? ' · auto' : '')}
              onClick={onClick}
            >
              <span className="cue-ic">{m.icon}</span>
              <span className="cue-lbl">{m.label}{auto && <span className="cue-auto">auto</span>}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── per-kind step forms ──────────────────────────────────────────────────────
type FaceOpt = 'default' | '1' | '-1' | 'dir' | '-dir'
const faceToOpt = (f: 1 | -1 | 'dir' | '-dir' | undefined): FaceOpt =>
  f === undefined ? 'default' : f === 1 ? '1' : f === -1 ? '-1' : f
const optToFace = (o: FaceOpt): 1 | -1 | 'dir' | '-dir' | undefined =>
  o === 'default' ? undefined : o === '1' ? 1 : o === '-1' ? -1 : o

function StepForm({ step, onChange }: { step: Step; onChange: (fn: (s: Step) => Step) => void }) {
  const patch = (p: Record<string, unknown>) => onChange((s) => ({ ...s, ...p } as Step))
  switch (step.do) {
    case 'pose':
      return (
        <>
          <SelectField label="pose" value={step.pose} options={POSES} onChange={(v) => patch({ pose: v })} />
          <SelectField label="face" value={faceToOpt(step.face)} options={['default', 'dir', '-dir', '1', '-1']} onChange={(v) => patch({ face: optToFace(v) })} />
          <NumField label="ms" value={step.ms} onChange={(v) => patch({ ms: v })} />
        </>
      )
    case 'move':
      return <MoveForm step={step} patch={patch} />
    case 'say':
      return (
        <>
          <TextField label="text" value={step.text} onChange={(v) => patch({ text: v })} />
          <NumField label="holdMs" value={step.holdMs} onChange={(v) => patch({ holdMs: v })} />
        </>
      )
    case 'sfx':
      return <SelectField label="kind" value={step.kind} options={SFX_KINDS} onChange={(v) => patch({ kind: v })} />
    case 'fx':
      return (
        <>
          <SelectField label="kind" value={step.kind} options={FX_KINDS} onChange={(v) => patch({ kind: v })} />
          <SelectField label="dir" value={step.dir === -1 ? '-1' : step.dir === 1 ? '1' : 'default'} options={['default', '1', '-1']} onChange={(v) => patch({ dir: v === 'default' ? undefined : (Number(v) as 1 | -1) })} />
        </>
      )
    case 'cam':
      return <CamForm step={step} patch={patch} />
    case 'camClear':
      return <div className="muted" style={{ padding: '2px 0' }}>clears the camera focus</div>
    case 'wait':
      return <NumField label="ms" value={step.ms} onChange={(v) => patch({ ms: v ?? 0 })} />
  }
}

function MoveForm({ step, patch }: { step: Extract<Step, { do: 'move' }>; patch: (p: Record<string, unknown>) => void }) {
  const to = step.to
  const setTo = (t: MoveTarget) => patch({ to: t })
  return (
    <>
      <SelectField label="target" value={to.at} options={['anchor', 'offset', 'panelEdge']} onChange={(v) => setTo(defaultTarget(v))} />
      {to.at === 'anchor' && (
        <div className="row">
          <NumField label="dx" value={to.dx} onChange={(v) => setTo({ ...to, dx: v })} />
          <NumField label="dy" value={to.dy} onChange={(v) => setTo({ ...to, dy: v })} />
        </div>
      )}
      {to.at === 'offset' && (
        <div className="row">
          <NumField label="dx" value={to.dx} onChange={(v) => setTo({ ...to, dx: v ?? 0 })} />
          <NumField label="dy" value={to.dy} onChange={(v) => setTo({ ...to, dy: v ?? 0 })} />
        </div>
      )}
      {to.at === 'panelEdge' && (
        <>
          <SelectField label="panel" value={to.panel} options={['from', 'to']} onChange={(v) => setTo({ ...to, panel: v })} />
          <SelectField label="side" value={to.side} options={['near', 'far', 'left', 'right', 'top', 'bottom']} onChange={(v) => setTo({ ...to, side: v })} />
          <div className="row">
            <NumField label="inset" value={to.inset} onChange={(v) => setTo({ ...to, inset: v })} />
            <NumField label="dy" value={to.dy} onChange={(v) => setTo({ ...to, dy: v })} />
          </div>
        </>
      )}
      <div className="row">
        <NumField label="ms" value={step.ms} onChange={(v) => patch({ ms: v })} />
        <NumField label="speed" value={step.speed} onChange={(v) => patch({ speed: v })} />
      </div>
      <div className="row">
        <SelectField label="ease" value={step.ease ?? 'glide'} options={EASE_NAMES} onChange={(v) => patch({ ease: v as EaseName })} />
        <SelectField label="easeY" value={step.easeY ?? (step.ease ?? 'glide')} options={EASE_NAMES} onChange={(v) => patch({ easeY: v as EaseName })} />
      </div>
      <SelectField label="pose" value={step.pose ?? 'walk'} options={POSES} onChange={(v) => patch({ pose: v })} />
      <SelectField label="arc" value={step.arc ?? 'none'} options={['none', 'hop', 'vault']} onChange={(v) => patch({ arc: v === 'none' ? undefined : v })} />
      <SelectField label="sfx" value={step.sfx ?? 'none'} options={['none', ...SFX_KINDS]} onChange={(v) => patch({ sfx: v === 'none' ? undefined : v })} />
    </>
  )
}

function defaultTarget(at: 'anchor' | 'offset' | 'panelEdge'): MoveTarget {
  if (at === 'anchor') return { at: 'anchor' }
  if (at === 'offset') return { at: 'offset', dx: 0, dy: 0 }
  return { at: 'panelEdge', panel: 'to', side: 'top' }
}

function CamForm({ step, patch }: { step: Extract<Step, { do: 'cam' }>; patch: (p: Record<string, unknown>) => void }) {
  const onKind = typeof step.on === 'object' ? 'custom' : step.on
  return (
    <>
      <SelectField
        label="on"
        value={onKind}
        options={['dash', 'target', 'midpoint', 'custom']}
        onChange={(v) => patch({ on: v === 'custom' ? { cx: 460, cy: 330 } : v })}
      />
      {typeof step.on === 'object' && (
        <div className="row">
          <NumField label="cx" value={step.on.cx} onChange={(v) => patch({ on: { cx: v ?? 0, cy: (step.on as { cy: number }).cy } })} />
          <NumField label="cy" value={step.on.cy} onChange={(v) => patch({ on: { cx: (step.on as { cx: number }).cx, cy: v ?? 0 } })} />
        </div>
      )}
      <div className="row">
        <NumField label="mult" value={step.mult} onChange={(v) => patch({ mult: v })} step={0.05} />
        <SelectField label="fast" value={step.fast === false ? 'no' : 'yes'} options={['yes', 'no']} onChange={(v) => patch({ fast: v === 'yes' })} />
      </div>
    </>
  )
}
