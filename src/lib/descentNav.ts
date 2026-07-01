/**
 * The navigator — turns "go deeper / go back" into a single choreographed,
 * weighted GSAP plunge between discrete depths. A move can't be interrupted
 * (the store's `transitioning` flag gates input), so every transition lands
 * cleanly: no infinite scroll, no half-states. Shared module so the HUD, the
 * keyboard, the wheel/touch, and focus-driven nav all drive one tween.
 */
import gsap from 'gsap'
import { useDescentStore, clampDepth } from '@/state/descentStore'
import { EASE } from '@/lib/easing'

const pos = { value: 0 }
let tween: gsap.core.Tween | null = null

export function goTo(target: number): void {
  const s = useDescentStore.getState()
  target = clampDepth(target)
  if (s.transitioning || target === s.depth) return

  s.setDepthState(target, true)
  const distance = Math.abs(target - pos.value)
  // weight scales with distance — a longer plunge takes longer, with mass
  const duration = Math.min(1.7, 0.95 + distance * 0.42)

  tween?.kill()
  tween = gsap.to(pos, {
    value: target,
    duration,
    ease: EASE.turn, // power3.inOut — heavy in, settles dead, no overshoot
    onUpdate: () => useDescentStore.getState().setPosition(pos.value),
    onComplete: () => useDescentStore.getState().setDepthState(target, false),
  })
}

export const descend = (): void => goTo(useDescentStore.getState().depth + 1)
export const ascend = (): void => goTo(useDescentStore.getState().depth - 1)
