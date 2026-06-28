/**
 * Input for the discrete descent. Wheel, keys, and touch-swipe each request ONE
 * depth move; a cooldown + the store's transitioning gate prevent trackpad
 * momentum or a held key from flinging through depths. The page itself does not
 * scroll (the body is locked) — movement is always a deliberate, choreographed
 * plunge.
 */
import { useEffect } from 'react'
import { useDescentStore } from '@/state/descentStore'
import { lastDepthIndex } from '@/lib/depths'
import { goTo, descend, ascend } from '@/lib/descentNav'

export function useDescent(): void {
  useEffect(() => {
    const COOLDOWN = 420
    let lastNav = 0
    const canGo = () => !useDescentStore.getState().transitioning && performance.now() - lastNav > COOLDOWN
    const fire = (dir: 1 | -1) => {
      if (!canGo()) return
      lastNav = performance.now()
      dir > 0 ? descend() : ascend()
    }

    let wheelAccum = 0
    let wheelDecay: number | undefined
    const onWheel = (e: WheelEvent) => {
      wheelAccum += e.deltaY
      if (Math.abs(wheelAccum) > 28 && canGo()) {
        fire(wheelAccum > 0 ? 1 : -1)
        wheelAccum = 0
      }
      window.clearTimeout(wheelDecay)
      wheelDecay = window.setTimeout(() => (wheelAccum = 0), 140)
    }

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'j') {
        e.preventDefault()
        fire(1)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault()
        fire(-1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        goTo(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goTo(lastDepthIndex)
      }
    }

    let touchY: number | null = null
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY == null) return
      const dy = (e.changedTouches[0]?.clientY ?? touchY) - touchY
      if (Math.abs(dy) > 45) fire(dy < 0 ? 1 : -1)
      touchY = null
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    if (import.meta.env.DEV) {
      ;(window as unknown as { codexGoTo?: (i: number) => void }).codexGoTo = goTo
    }

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])
}
