/**
 * Wire the persisted journey into the live session: count the visit, remember
 * the deepest depth reached, restore the reader's reading-mode preference,
 * pre-light the illuminations they found before (a soft permanent floor), and
 * save their scroll position when they leave.
 */
import { useEffect } from 'react'
import { useJourneyStore } from '@/state/journeyStore'
import { useDescentStore } from '@/state/descentStore'
import { useDiscoveryStore } from '@/state/discoveryStore'
import { useUiStore } from '@/state/uiStore'

let begun = false

export function useJourney(): void {
  useEffect(() => {
    if (!begun) {
      begun = true
      useJourneyStore.getState().beginVisit()
    }

    const j = useJourneyStore.getState()
    if (j.readingModePreferred) useUiStore.getState().setReadingMode(true)

    // first visit on a touch device (no hover): auto-suggest reading mode so the
    // codex opens fully readable with no aiming — the no-hover backstop (brief §7).
    const coarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches
    if (coarse && j.visits <= 1 && !j.readingModePreferred) {
      useUiStore.getState().setReadingMode(true)
      // persist explicitly — the uiStore subscriber below is registered after
      // this synchronous set, so it would otherwise miss it and a returning
      // mobile reader would get the opacity-only reveal with no hover
      useJourneyStore.getState().setReadingPreferred(true)
    }

    // a returning reader's found illuminations come back softly lit
    j.illuminationsFound.forEach((id) => useDiscoveryStore.getState().discover(id))
    requestAnimationFrame(() => {
      j.illuminationsFound.forEach((id) => {
        const el = document.querySelector<HTMLElement>(`[data-illumination="${CSS.escape(id)}"]`)
        if (el) {
          el.classList.add('found')
          el.style.setProperty('--reveal-floor', '0.4')
        }
      })
    })

    // mark the deepest depth reached
    useJourneyStore.getState().markDepth(useDescentStore.getState().depth)
    const unsubDepth = useDescentStore.subscribe((s, prev) => {
      if (s.depth !== prev.depth) useJourneyStore.getState().markDepth(s.depth)
    })

    // persist reading-mode preference whenever it changes
    const unsubUi = useUiStore.subscribe((s, prev) => {
      if (s.readingMode !== prev.readingMode) useJourneyStore.getState().setReadingPreferred(s.readingMode)
    })

    // remember the depth they were at when they leave (event-driven)
    const save = () => useJourneyStore.getState().setScrollProgress(useDescentStore.getState().depth)
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', save)

    return () => {
      unsubDepth()
      unsubUi()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', save)
    }
  }, [])
}
