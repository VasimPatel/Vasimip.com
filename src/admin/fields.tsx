// Compact, reusable form controls for the admin inspector / action editor.
// Everything is uncontrolled-friendly (blank number → undefined) and styled via
// admin.css. Kept deliberately small — no form library.
import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function NumField({ label, value, onChange, step, placeholder }: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  step?: number
  placeholder?: string
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step ?? 1}
        placeholder={placeholder}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => {
          const s = e.target.value
          if (s === '') { onChange(undefined); return }
          const n = Number(s)
          onChange(Number.isNaN(n) ? undefined : n)
        }}
      />
    </Field>
  )
}

export function TextField({ label, value, onChange, area, placeholder, rows }: {
  label: string
  value: string
  onChange: (v: string) => void
  area?: boolean
  placeholder?: string
  rows?: number
}) {
  return (
    <Field label={label}>
      {area
        ? <textarea rows={rows ?? 3} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: readonly T[] | readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

export function CheckField({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="field chk">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="sec">
      <div className="sec-h">{title}<span className="grow" />{right}</div>
      {children}
    </div>
  )
}
