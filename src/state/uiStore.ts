/**
 * UI state — chiefly reading mode ("RAISE THE LIGHTS"). Reading mode is the
 * mandatory companion to reveal-on-light: a clearly visible toggle that lifts
 * the lights so the whole codex is readable without hunting (brief §4.2). It is
 * independent of reduced motion — you can have full motion with the lights up.
 */
import { create } from 'zustand'

export interface UiStore {
  readingMode: boolean
  setReadingMode: (v: boolean) => void
  toggleReadingMode: () => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  readingMode: false,
  setReadingMode: (readingMode) => set({ readingMode }),
  toggleReadingMode: () => set({ readingMode: !get().readingMode }),
}))
