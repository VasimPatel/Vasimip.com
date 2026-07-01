/**
 * The five depths — a real beginning, middle, and end so the codex feels
 * authored and finite, not an infinite scroll. Each depth is a PLACE with its
 * own light and mood, mapping to a facet of the owner (brief §3).
 *
 * This module is the single source of truth for depth order, world-space Y
 * positions along the −Y descent axis, and the per-depth mood the SceneDirector
 * crossfades between (ambient level, fog, and which way the torch's warm/cold
 * ramp is biased).
 */
import type { ColorName } from './palette'
import { PAGES } from '@/content/pages'

/**
 * The depth order + ids. This is the ONE list to edit to add, remove, or
 * reorder pages (each id must have a matching entry in `src/content/pages.ts`).
 */
export const DEPTHS = ['threshold', 'works', 'frontier', 'hearth', 'arrival'] as const
export type DepthId = (typeof DEPTHS)[number]

/** Base world-units between depth centers along −Y. */
export const DEPTH_GAP = 14

export interface DepthMood {
  /** ambient floor — how much the dark is lifted before the torch adds light.
   *  Near-zero at the Threshold; full at the Arrival. */
  ambient: number
  /** the color the ambient/hemisphere sits at (cool early, warm late) */
  ambientColor: ColorName
  /** exponential fog density — thick and close early, clear at the bottom */
  fogDensity: number
  fogColor: ColorName
  /** the cold END of the torch's distance ramp (vellum core is always warm).
   *  Biases toward verdigris in the cold depths, toward ink elsewhere. */
  rampCold: ColorName
  /** a near-imperceptible scene tilt for strangeness (Frontier only) */
  tiltZ?: number
}

export interface DepthDef {
  id: DepthId
  index: 0 | 1 | 2 | 3 | 4
  roman: string
  /** chapter title (display blackletter) */
  title: string
  /** the one-word facet */
  facet: string
  /** multiplies DEPTH_GAP for the run INTO this depth (Works reads tall) */
  gapScale: number
  mood: DepthMood
}

/**
 * Per-depth title + scene mood, DERIVED from the single authoring file
 * `src/content/pages.ts`. Edit titles/colours/mood THERE. This just reshapes a
 * page's `theme` into the `mood` the SceneDirector + torch ramp expect.
 */
export const DEPTH_DEFS: Record<DepthId, DepthDef> = Object.fromEntries(
  DEPTHS.map((id, i) => {
    const p = PAGES[id]
    return [
      id,
      {
        id,
        index: i as DepthDef['index'],
        roman: p.roman,
        title: p.title,
        facet: p.facet,
        gapScale: p.gapScale ?? 1,
        mood: {
          ambient: p.theme.ambient,
          ambientColor: p.theme.ambientColor,
          fogDensity: p.theme.fog,
          fogColor: p.theme.fogColor,
          rampCold: p.theme.rampCold,
          tiltZ: p.theme.tilt,
        },
      },
    ]
  }),
) as Record<DepthId, DepthDef>

export const DEPTH_LIST: DepthDef[] = DEPTHS.map((id) => DEPTH_DEFS[id])

/** Cumulative world-space Y of each depth center along −Y (threshold at 0). */
export const DEPTH_Y: number[] = (() => {
  const ys: number[] = []
  let y = 0
  DEPTH_LIST.forEach((d, i) => {
    if (i > 0) y -= DEPTH_GAP * d.gapScale
    ys.push(y)
  })
  return ys
})()

/** Total descent span in world units (positive magnitude). */
export const DESCENT_SPAN = Math.abs(DEPTH_Y[DEPTH_Y.length - 1])

export const lastDepthIndex = DEPTH_LIST.length - 1

/** scroll progress 0..1 -> fractional depth 0..(N-1) */
export function progressToDepth(progress: number): number {
  return progress * lastDepthIndex
}

/** scroll progress 0..1 -> nearest mounted depth index */
export function activeDepthFromProgress(progress: number): number {
  return Math.round(progressToDepth(progress))
}

/** fractional depth (0..N-1) -> interpolated world-space camera Y (respects gaps) */
export function depthYAt(frac: number): number {
  if (frac <= 0) return DEPTH_Y[0]
  if (frac >= lastDepthIndex) return DEPTH_Y[lastDepthIndex]
  const i = Math.floor(frac)
  const f = frac - i
  return DEPTH_Y[i] + (DEPTH_Y[i + 1] - DEPTH_Y[i]) * f
}
