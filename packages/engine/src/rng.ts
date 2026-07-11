// Seeded, serializable PRNG (mulberry32). Deterministic within one JS runtime —
// the only source of randomness the engine is allowed to use (Math.random is
// banned by the determinism lint). State is a single u32, so it export/restores
// trivially, which is what makes snapshot/replay total.

export interface Rng {
  /** Next float in [0, 1). */
  float(): number
  /** Next integer in [minIncl, maxExcl). */
  int(minIncl: number, maxExcl: number): number
  /** Uniformly pick an element (throws-free; caller ensures non-empty). */
  pick<T>(arr: readonly T[]): T
  /** Current internal u32 state — snapshot this to resume identically. */
  getState(): number
  /** Restore a previously captured u32 state. */
  setState(state: number): void
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0
  const float = (): number => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    float,
    int: (minIncl, maxExcl) => minIncl + Math.floor(float() * (maxExcl - minIncl)),
    pick: (arr) => arr[Math.floor(float() * arr.length)],
    getState: () => s >>> 0,
    setState: (state) => {
      s = state >>> 0
    },
  }
}
