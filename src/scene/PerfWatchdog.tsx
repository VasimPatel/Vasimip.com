/**
 * Live perf guard. drei's PerformanceMonitor samples real FPS; a sustained
 * decline demotes the tier one step (shedding shadows, then bloom, then particle
 * counts), and AdaptiveDpr lowers resolution under load — so a hot phone sheds
 * effects before the descent is ever allowed to stutter (descent smoothness is
 * sacred). We only demote, never auto-promote, to avoid thrash.
 */
import { PerformanceMonitor, AdaptiveDpr } from '@react-three/drei'
import { usePerfStore, type PerfTier } from '@/state/perfStore'

const DEMOTE: Record<PerfTier, PerfTier> = {
  high: 'reduced',
  reduced: 'minimal',
  minimal: 'minimal',
}

export function PerfWatchdog() {
  return (
    <>
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => {
          const t = usePerfStore.getState().tier
          if (DEMOTE[t] !== t) usePerfStore.getState().setTier(DEMOTE[t])
        }}
        onFallback={() => usePerfStore.getState().setTier('minimal')}
      />
      <AdaptiveDpr pixelated={false} />
    </>
  )
}
