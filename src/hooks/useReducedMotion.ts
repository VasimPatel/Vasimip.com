/**
 * Keep the motion store in sync with prefers-reduced-motion, live (the user can
 * toggle it without reloading). When reduced: flicker locks steady, embers
 * freeze, parallax/page-turns become weighted cross-dissolves, and the reveal
 * floor lifts (brief §5).
 */
import { useEffect } from 'react'
import { useMotionStore } from '@/state/motionStore'
import { useUiStore } from '@/state/uiStore'

export function useReducedMotion(): void {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      useMotionStore.getState().setReduced(mq.matches)
      // Reduced motion engages reading mode so the parchment is evenly lit and
      // the ink reads everywhere — the legibility a11y backstop. Lifting opacity
      // alone would leave dark ink on an unlit page (the substrate, not the
      // opacity, is what must change). The reader can still lower the lights.
      if (mq.matches) useUiStore.getState().setReadingMode(true)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
}
