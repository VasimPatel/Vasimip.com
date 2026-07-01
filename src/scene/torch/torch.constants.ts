/**
 * The torch's physical constants — the SINGLE shared source of truth for the
 * WebGL light AND the DOM reveal, so the lit vellum pool and the revealed prose
 * coincide by construction (blueprint: "literally the same light").
 *
 * Light magnitudes here are TUNED starting points gated by exposure, not
 * calibrated physical values — expect to nudge them while watching the spike.
 */
import type { ColorName } from '@/lib/palette'

export const TORCH = {
  /**
   * Flame offset from the aim point, in world units. Centered on the cursor
   * (x/y ≈ 0) so the flame and its glow sit ON the look-point — the torch light
   * tracks the cursor. Only +z, so the flame floats just in front of the page.
   * (The old up-and-to-the-side graze only mattered for the static-parchment
   * fallback; the living-ink page is an unlit shader, so head-on is fine.)
   */
  offset: { x: 0.0, y: 0.0, z: 0.45 },

  // ---- hero spotlight (single 2D shadow map on HIGH; cheaper than a point
  //      light's 6-face cube, and it rakes better) ------------------------
  decay: 2, // physically-correct falloff (NOT the anti-gradient mechanism — relief is)
  distance: 7, // finite reach: the dark stays dark
  intensityBase: 32, // gentler pool — reveals the living scene without bleaching it
  angle: 1.0, // cone half-angle (rad), ~57°
  penumbra: 0.9, // soft cone edge

  // ---- flame core (a tiny emissive mesh; feeds bloom, NOT a shadow caster) -
  flameIntensity: 4,
  flameDistance: 2.4,
  flameRadius: 0.035,

  // ---- the warm-ramp reach -------------------------------------------------
  /** world-space radius the vellum shader ramps the fire LUT across (a tight
   *  pool so the dark around it stays dark and present) */
  worldRadius: 5.5,
  /** in-shader bump self-shadow strength (the un-fakeable micro-occlusion) */
  selfShadow: 0.72,
  /** normalScale for the parchment relief (restraint; bumped over gilt) */
  normalScale: 0.9,

  // ---- DOM reveal (screen-space, tuned to coincide with the world pool) ----
  /** reveal radius as a fraction of min(viewport w,h) — a small, intimate torch
   *  pool so most of the page stays in atmospheric shadow */
  revealScreenFraction: 0.17,
  /** inner edge of the reveal smoothstep, as a fraction of the radius */
  revealSoftness: 0.5,

  // ---- renderer exposure (one tone-map at the end of the chain) ------------
  exposure: 1.0,
} as const

export const FLICKER = {
  /** primary slow flicker: ± fraction of base intensity */
  amp1: 0.12,
  freq1: 2.3,
  /** secondary fast shimmer, smaller */
  amp2: 0.05,
  freq2: 9.1,
  /** sub-perceptual position sway, world units */
  jitter: 0.045,
  freqJitter: 7.0,
  /** color micro-shift warmer on dim troughs */
  warmShift: 0.03,
} as const

export const EMBERS = {
  count: { high: 600, reduced: 120, minimal: 12 },
  riseMin: 0.18,
  riseMax: 0.5, // world units / second
  drift: 0.12, // lateral simplex sway
  lifetimeMin: 2.4,
  lifetimeMax: 5.5,
  sizeMin: 0.012,
  sizeMax: 0.05, // kept small — under the mobile ALIASED_POINT_SIZE_RANGE cap
} as const

export const NORMAL_RES = { high: 1024, reduced: 512, minimal: 256 } as const

/**
 * The fire ramp the torch fades through, by normalized distance from the core.
 * Brief §6 order: vellum (core) -> gilt -> amber -> ember (edge) -> ground.
 * The cold END (>0.82) is replaced per-depth by that depth's `rampCold` token
 * so the cold depths fade to verdigris and the warm ones to ink.
 */
export const LUT_STOPS: ReadonlyArray<{ t: number; color: ColorName }> = [
  { t: 0.0, color: 'vellum' },
  { t: 0.3, color: 'gilt' },
  { t: 0.55, color: 'amber' },
  { t: 0.8, color: 'ember' },
  { t: 1.0, color: 'ink' }, // overridden per-depth by rampCold
] as const

export const LUT_SIZE = 256
