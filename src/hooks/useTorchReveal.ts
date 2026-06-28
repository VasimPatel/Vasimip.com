/**
 * Reveal-on-light, the DOM half. ONE throttled rAF reads the torch's screen
 * position and each revealable element's box, and writes a per-element `--lit`
 * (0..1). CSS turns that into opacity over content that ALWAYS exists in the DOM
 * — never display:none / visibility:hidden / aria-hidden — so the prose stays
 * selectable, focusable, and crawlable (brief §7).
 *
 * The torch's screen position and the WebGL pool derive from the same torch
 * store, so the lit vellum and the revealed words coincide by construction.
 *
 * No React state in the loop — direct style writes only, and only when a value
 * actually crosses a small delta, so there is no layout thrash.
 */
import { useEffect } from 'react'
import { useTorchStore } from '@/state/torchStore'
import { useUiStore } from '@/state/uiStore'
import { useDiscoveryStore } from '@/state/discoveryStore'
import { useJourneyStore } from '@/state/journeyStore'
import { TORCH } from '@/scene/torch/torch.constants'
import { smoothstep, clamp } from '@/lib/damp'

export function useTorchReveal(): void {
  useEffect(() => {
    let raf = 0
    const prev = new WeakMap<HTMLElement, number>()
    let els: HTMLElement[] = []
    let collected = false

    const collect = () => {
      els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
      collected = els.length > 0
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!collected) collect()
      if (!els.length) return

      const reading = useUiStore.getState().readingMode
      const { x: tx, y: ty } = useTorchStore.getState().screen
      const vw = window.innerWidth
      const vh = window.innerHeight
      const baseR = TORCH.revealScreenFraction * Math.min(vw, vh)
      const discovered = useDiscoveryStore.getState()

      // read all boxes first, then write — no interleaved layout thrash
      const n = els.length
      const lits = new Array<number>(n)
      for (let i = 0; i < n; i++) {
        const el = els[i]
        if (reading) {
          lits[i] = 1
          continue
        }
        const r = el.getBoundingClientRect()
        // skip far-offscreen elements cheaply
        if (r.bottom < -vh || r.top > vh * 2) {
          lits[i] = prev.get(el) ?? 0
          continue
        }
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const dist = Math.hypot(tx - cx, ty - cy)
        const tight = el.dataset.tight !== undefined
        const radius = tight ? baseR * 0.52 : baseR
        const inner = radius * TORCH.revealSoftness
        lits[i] = clamp(1 - smoothstep(inner, radius, dist), 0, 1)
      }

      for (let i = 0; i < n; i++) {
        const el = els[i]
        const lit = lits[i]
        const was = prev.get(el)
        if (was === undefined || Math.abs(was - lit) > 0.004) {
          el.style.setProperty('--lit', lit.toFixed(3))
          prev.set(el, lit)
        }
        // latch a found hidden illumination (stays softly lit on return)
        if (!reading && lit > 0.82 && el.dataset.illumination) {
          discovered.discover(el.dataset.illumination)
          useJourneyStore.getState().markIllumination(el.dataset.illumination)
        }
      }
    }

    raf = requestAnimationFrame(tick)
    const onResize = () => collect()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])
}
