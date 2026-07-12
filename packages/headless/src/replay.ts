// replay(input, expected) — re-simulate and compare against a recorded result. The
// plan's minimum is replay(trace) → boolean; we exceed it (debuggability is the
// point): on mismatch we report WHERE it diverged.
//
//   expected.hash        — required; the recorded finalState hash.
//   expected.traceLength — optional; the recorded trace length.
//   expected.trace       — optional; the recorded [{tick,type}] sequence. When present
//                          we scan for the FIRST index whose tick/type differs, so a
//                          divergence points at an event, not just a boolean.
//
// Comparison order (most-specific first): reference trace → traceLength → hash. A pure
// hash mismatch (no reference trace) still reports a `hash` divergence with both values.

import { simulate, type SimulateInput, type SimulateOptions, type Outcome } from './simulate'

export interface ReplayExpected {
  hash: string
  traceLength?: number
  trace?: { tick: number; type: string }[]
}

export interface ReplayDivergence {
  kind: 'trace' | 'length' | 'hash'
  /** For 'trace'/'length': the first diverging trace index. */
  index?: number
  expected?: unknown
  actual?: unknown
  message: string
}

export interface ReplayResult {
  ok: boolean
  hash: string
  ticks: number
  outcome: Outcome
  divergence?: ReplayDivergence
}

export function replay(input: SimulateInput, expected: ReplayExpected, opts: SimulateOptions = {}): ReplayResult {
  const res = simulate(input, opts)
  const base = { hash: res.hash, ticks: res.ticks, outcome: res.outcome }

  if (expected.trace) {
    const exp = expected.trace
    const got = res.trace
    const n = Math.min(exp.length, got.length)
    for (let i = 0; i < n; i++) {
      if (exp[i].tick !== got[i].tick || exp[i].type !== got[i].type) {
        return {
          ...base,
          ok: false,
          divergence: {
            kind: 'trace',
            index: i,
            expected: { tick: exp[i].tick, type: exp[i].type },
            actual: { tick: got[i].tick, type: got[i].type },
            message: `trace diverged at index ${i}: expected ${exp[i].type}@${exp[i].tick}, got ${got[i].type}@${got[i].tick}`,
          },
        }
      }
    }
    if (exp.length !== got.length) {
      return {
        ...base,
        ok: false,
        divergence: {
          kind: 'length',
          index: n,
          expected: exp.length,
          actual: got.length,
          message: `trace length diverged: expected ${exp.length} events, got ${got.length} (identical up to index ${n})`,
        },
      }
    }
  }

  if (expected.traceLength !== undefined && expected.traceLength !== res.trace.length) {
    return {
      ...base,
      ok: false,
      divergence: {
        kind: 'length',
        index: Math.min(expected.traceLength, res.trace.length),
        expected: expected.traceLength,
        actual: res.trace.length,
        message: `trace length diverged: expected ${expected.traceLength}, got ${res.trace.length}`,
      },
    }
  }

  if (expected.hash !== res.hash) {
    return {
      ...base,
      ok: false,
      divergence: {
        kind: 'hash',
        expected: expected.hash,
        actual: res.hash,
        message: `state hash diverged: expected ${expected.hash}, got ${res.hash}`,
      },
    }
  }

  return { ...base, ok: true }
}
