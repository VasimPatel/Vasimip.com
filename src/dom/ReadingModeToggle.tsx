/**
 * RAISE THE LIGHTS — the mandatory reading-mode toggle (brief §4.2). Clearly
 * visible, keyboard-operable (press L), aria-pressed for assistive tech. When
 * on, it flips :root.reading-mode so every reveal collapses to fully legible —
 * the UX and accessibility backstop for the whole torch mechanic.
 */
import { useEffect } from 'react'
import { useUiStore } from '@/state/uiStore'

export function ReadingModeToggle() {
  const reading = useUiStore((s) => s.readingMode)
  const toggle = useUiStore((s) => s.toggleReadingMode)

  useEffect(() => {
    document.documentElement.classList.toggle('reading-mode', reading)
  }, [reading])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'l' && e.key !== 'L') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return (
    <button
      type="button"
      className="reading-toggle"
      aria-pressed={reading}
      onClick={toggle}
      title="Raise or lower the lights — press L"
    >
      <span className="reading-toggle-dot" aria-hidden="true" />
      {reading ? 'Lower the lights' : 'Raise the lights'}
    </button>
  )
}
