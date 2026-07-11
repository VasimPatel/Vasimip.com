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
    <div className="dojo-ae">
      <div className="dojo-moves">
        <div className="moves-h">moves he already knows</div>
        <div className="stunt-chips">
          {BUILTIN_MODES.map((mode) => (
            <div key={mode} className={`stunt-chip${builtinSel === mode ? ' on' : ''}`} onClick={() => pickBuiltin(mode)}>
              {BUILTIN_INFO[mode].label}
            </div>
          ))}
        </div>

        <div className="moves-h2">stunts you taught him</div>
        <div className="stunt-chips">
          {names.length === 0 && <div className="moves-none">none yet — teach him one below.</div>}
          {names.map((name) => (
            <div key={name} className={`stunt-chip custom${sel === name ? ' on' : ''}`} onClick={() => pickCustom(name)}>
              <span className="sc-nm">{name}</span>
              <button className="sc-op" onClick={(e) => { e.stopPropagation(); duplicate(name) }} title="make a copy">⧉</button>
              <button className="sc-op" onClick={(e) => { e.stopPropagation(); remove(name) }} title="forget it">✕</button>
            </div>
          ))}
        </div>

        <button className="teach-btn" onClick={addAction}>+ teach a new stunt</button>
      </div>

      <div className="dojo-detail">
        {builtinSel ? (
          <BuiltinDetail mode={builtinSel} onTest={onTestBuiltin} onFork={fork} />
        ) : !sel ? (
          <div className="dojo-blank">tap a move to see it, fork it, and make it yours.</div>
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
    <div className="stunt-detail">
      <div className="sd-head">
        <span className="sd-title">{info.label}</span>
        <span className="sd-lock" title="a move Dash was born knowing — you can look but not change it">🔒</span>
        <span className="grow" />
        <button className="ghost-btn" onClick={() => onFork(mode)} title="deep-clone this choreography into an editable custom stunt">fork it &amp; make it yours</button>
        <button className="try-btn" onClick={() => onTest(mode)}>▶ try it</button>
      </div>
      <p className="sd-blurb">{info.blurb}</p>
      <div className="sd-aside" title="when travel() may pick this move"><b>when he uses it</b> — {info.gates}</div>
      <div className="sd-note">
        This is one of Dash's built-in moves, so it's locked. Fork it to get an editable copy
        you can tinker with — the real, hand-tuned one stays safe in the engine.
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
    <div className="stunt-detail">
      <div className="sd-head">
        <input
          className="stunt-name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => { if (nameDraft !== name) onRename(name, nameDraft) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <span className="grow" />
        <span className={'err' in summary ? 'sd-err' : 'sd-time'}>
          {'err' in summary ? '⚠ ' + summary.err : `~${(summary.ms / 1000).toFixed(1)}s · ${summary.cues} beats`}
        </span>
        <button className="try-btn" onClick={() => onTest(name)}>▶ try it</button>
      </div>

      <details className="when-box">
        <summary>when can he use it?</summary>
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

      <div className="sd-seclbl">a stunt is just numbered sentences:</div>
      {def.steps.length === 0 && <div className="sd-emptysteps">no steps yet — add his first move below.</div>}
      {def.steps.map((step, i) => (
        <div key={i} id={'astep-' + i} className={`stunt-step${openStep === i ? ' hot' : ''}`}>
          <div className="ss-num">{i + 1}.</div>
          <div className="ss-body">
            <div className="ss-top">
              <select className="ss-kind" value={step.do} onChange={(e) => setStep(i, () => STEP_DEFAULTS[e.target.value as StepKind]())}>
                {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <span className="grow" />
              <button className="ss-op" onClick={() => moveStep(i, -1)} disabled={i === 0} title="earlier">▲</button>
              <button className="ss-op" onClick={() => moveStep(i, 1)} disabled={i === def.steps.length - 1} title="later">▼</button>
              <button className="ss-op" onClick={() => removeStep(i)} title="drop this step">✕</button>
            </div>
            <StepForm step={step} onChange={(fn) => setStep(i, fn)} />
          </div>
        </div>
      ))}
      <div className="ss-add">
        <select value={addKind} onChange={(e) => setAddKind(e.target.value as StepKind)}>
          {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className="ghost-btn" onClick={addStep}>+ add a step</button>
      </div>

      <div className="sd-seclbl">how it plays out</div>
      {'error' in compiled
        ? <div className="sd-err">⚠ {compiled.error}</div>
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
