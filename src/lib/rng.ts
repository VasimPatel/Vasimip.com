/**
 * Deterministic randomness. simplex-noise v4 takes a random source; we feed it
 * a seeded PRNG so the parchment grain, the ember field, and a returning
 * reader's "own" embers reproduce exactly (journey memory, brief §4.5).
 */

/** mulberry32 — tiny, fast, good-enough seeded PRNG returning [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable string -> 32-bit seed (per-depth grain seeds, illumination ids). */
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A fresh, stable seed for a returning reader's ember field. */
export function seedFromJourney(firstSeen: string): number {
  return hashStringToSeed(`codex:${firstSeen}`)
}
