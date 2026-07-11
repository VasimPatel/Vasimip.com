// Canonical state serialization + a bit-exact state hash (ENGINE_V2 §3 rule 1).
//
//  serializeState — canonical JSON (recursively sorted object keys) for snapshot
//                   round-tripping of FINITE state. JSON round-trips finite f64
//                   exactly, so restore is lossless; NaN/±Inf are not expected in
//                   snapshotted state (use hashState for identity, not this).
//
//  hashState      — FNV-1a 64-bit over a canonical byte encoding where every
//                   number contributes its Float64 BIT PATTERN via a shared
//                   DataView, never a decimal string. Identical structural state
//                   hashes identically across process runs within one runtime.
//
// Number canonicalization (documented, deliberate):
//   -0 collapses to +0 (they differ only in the sign bit) and every NaN collapses
//   to a single quiet-NaN pattern — so states that are structurally equal hash
//   equal regardless of which zero/NaN representation they hold.

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const U64 = 0xffffffffffffffffn

const TAG_NULL = 0
const TAG_UNDEF = 1
const TAG_BOOL = 2
const TAG_NUM = 3
const TAG_STR = 4
const TAG_ARR = 5
const TAG_OBJ = 6

// Shared 8-byte view for Float64 bit extraction (no per-call allocation).
const f64view = new DataView(new ArrayBuffer(8))

interface Hasher {
  byte(b: number): void
  u32(n: number): void
  f64(n: number): void
  str(s: string): void
  digest(): string
}

function makeHasher(): Hasher {
  let h = FNV_OFFSET
  const byte = (b: number): void => {
    h = ((h ^ BigInt(b & 0xff)) * FNV_PRIME) & U64
  }
  const u32 = (n: number): void => {
    byte(n)
    byte(n >>> 8)
    byte(n >>> 16)
    byte(n >>> 24)
  }
  return {
    byte,
    u32,
    f64(n) {
      if (Number.isNaN(n)) f64view.setFloat64(0, NaN)
      else if (n === 0) f64view.setFloat64(0, 0) // -0 === 0 is true → writes +0 bits
      else f64view.setFloat64(0, n)
      for (let i = 0; i < 8; i++) byte(f64view.getUint8(i))
    },
    str(s) {
      // UTF-16 code units — deterministic and avoids depending on TextEncoder.
      u32(s.length)
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        byte(c)
        byte(c >>> 8)
      }
    },
    digest() {
      return h.toString(16).padStart(16, '0')
    },
  }
}

function walk(h: Hasher, v: unknown): void {
  if (v === null) {
    h.byte(TAG_NULL)
    return
  }
  switch (typeof v) {
    case 'boolean':
      h.byte(TAG_BOOL)
      h.byte(v ? 1 : 0)
      return
    case 'number':
      h.byte(TAG_NUM)
      h.f64(v)
      return
    case 'string':
      h.byte(TAG_STR)
      h.str(v)
      return
    case 'object': {
      if (Array.isArray(v)) {
        h.byte(TAG_ARR)
        h.u32(v.length)
        for (const e of v) walk(h, e)
        return
      }
      const keys = Object.keys(v as Record<string, unknown>).sort()
      h.byte(TAG_OBJ)
      h.u32(keys.length)
      for (const k of keys) {
        h.str(k)
        walk(h, (v as Record<string, unknown>)[k])
      }
      return
    }
    default:
      // undefined, function, bigint, symbol — encode a stable tag so structure
      // (e.g. an explicit undefined field) still contributes deterministically.
      h.byte(TAG_UNDEF)
      return
  }
}

export function hashState(state: unknown): string {
  const h = makeHasher()
  walk(h, state)
  return h.digest()
}

function sortValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(sortValue)
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortValue((v as Record<string, unknown>)[k])
  }
  return out
}

export function serializeState(state: unknown): string {
  return JSON.stringify(sortValue(state))
}
