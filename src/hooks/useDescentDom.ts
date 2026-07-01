/**
 * Drives the DOM depth panels from the descent `position` — the half that makes
 * the text move WITH the world instead of drifting against it. Each panel fades
 * to full only when it is the current depth, and plunges (translateY) the way
 * the camera does, so the words rise past you as you descend. One rAF, direct
 * style writes, no React state.
 *
 * Focus-driven nav: tabbing a link inside a non-current depth navigates there,
 * so keyboard users walk the depths in order without ever landing on hidden text.
 */
import { useEffect } from 'react'
import { useDescentStore } from '@/state/descentStore'
import { goTo } from '@/lib/descentNav'

export function useDescentDom(): void {
  useEffect(() => {
    let raf = 0
    let panels: HTMLElement[] = []
    const prevActive = new WeakMap<HTMLElement, boolean>()

    const collect = () => {
      panels = Array.from(document.querySelectorAll<HTMLElement>('.depth[data-index]'))
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!panels.length) collect()
      if (!panels.length) return

      const pos = useDescentStore.getState().position
      const vh = window.innerHeight
      for (const panel of panels) {
        const idx = Number(panel.dataset.index)
        const d = idx - pos
        const ad = Math.abs(d)
        const opacity = Math.max(0, 1 - ad / 0.82)
        const ty = d * vh * 0.6 // content rises past you as you descend
        const scale = 1 - Math.min(ad, 1) * 0.05
        panel.style.opacity = opacity.toFixed(3)
        panel.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`

        const active = opacity > 0.6
        panel.style.pointerEvents = active ? 'auto' : 'none'
        if (prevActive.get(panel) !== active) {
          prevActive.set(panel, active)
          panel.classList.toggle('is-active', active)
          // keep faded panels out of the tab order (but in the a11y reading tree)
          panel.querySelectorAll<HTMLElement>('a, button, input').forEach((el) => {
            el.tabIndex = active ? 0 : -1
          })
        }
      }
    }

    // a link/control receiving focus inside a non-current depth navigates there
    const onFocusIn = (e: FocusEvent) => {
      const panel = (e.target as HTMLElement)?.closest?.('.depth[data-index]') as HTMLElement | null
      if (!panel) return
      const idx = Number(panel.dataset.index)
      if (idx !== useDescentStore.getState().depth) goTo(idx)
    }

    raf = requestAnimationFrame(tick)
    const onResize = () => collect()
    window.addEventListener('resize', onResize)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])
}
