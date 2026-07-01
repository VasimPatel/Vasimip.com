/**
 * The one performance tier every subsystem reads. Set by a boot GPU/FPS probe
 * (usePerfTier) and a live <PerformanceMonitor> watchdog that can demote
 * mid-session. Descent smoothness is sacred — a hot phone sheds embers and
 * bloom before the descent is ever allowed to stutter.
 */
import { create } from 'zustand'

export type PerfTier = 'high' | 'reduced' | 'minimal'

export interface PerfFlags {
  shadows: boolean
  /** mount the EffectComposer (selective bloom) at all */
  composer: boolean
  bloom: boolean
  embers: number
  normalRes: 256 | 512 | 1024
  dpr: [number, number]
  /** drop the 3D lit scene for the full-screen 2D shader-quad torch */
  fallback2d: boolean
}

export const TIER_FLAGS: Record<PerfTier, PerfFlags> = {
  high: { shadows: true, composer: true, bloom: true, embers: 600, normalRes: 1024, dpr: [1, 2], fallback2d: false },
  reduced: { shadows: false, composer: true, bloom: true, embers: 120, normalRes: 512, dpr: [1, 1.5], fallback2d: false },
  minimal: { shadows: false, composer: false, bloom: false, embers: 12, normalRes: 256, dpr: [1, 1], fallback2d: true },
}

export interface PerfStore {
  tier: PerfTier
  flags: PerfFlags
  /** false when WebGL2 is unavailable — the site degrades to DOM + reading mode */
  webglOk: boolean
  /** true once the boot probe has run (until then, render conservatively) */
  probed: boolean
  /**
   * Whether the per-depth LIVING SCENES run (vs the static parchment page).
   * Decided ONCE at boot and never touched by the live watchdog — the watchdog
   * may shed bloom/shadows/dpr for frame-rate, but it must never remount or kill
   * the scenes (that was the flicker / "it reverts to static" bug). The scenes'
   * canvas resolution is a fixed constant in LivingPage for the same reason; only
   * their redraw RATE adapts live to the tier (cheap, no remount).
   */
  games: boolean
  setTier: (tier: PerfTier) => void
  setProbe: (tier: PerfTier, webglOk: boolean) => void
}

export const usePerfStore = create<PerfStore>((set) => ({
  // start at REDUCED until the probe proves the GPU can take more — safer than
  // opening on HIGH and stuttering on a weak device.
  tier: 'reduced',
  flags: TIER_FLAGS.reduced,
  webglOk: true,
  probed: false,
  games: true, // assume capable until the boot probe says otherwise
  // a live demote shifts the demotable flags ONLY — `games` is left alone
  setTier: (tier) => set({ tier, flags: TIER_FLAGS[tier], probed: true }),
  setProbe: (tier, webglOk) =>
    set({ tier, flags: TIER_FLAGS[tier], webglOk, probed: true, games: webglOk && tier !== 'minimal' }),
}))
