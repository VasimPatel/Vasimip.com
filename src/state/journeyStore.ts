/**
 * Journey memory (brief §4.5) — what the reader did, kept in localStorage so the
 * codex recognizes a returning reader: illuminations they found stay softly lit,
 * their ember seed reproduces "their" fire, and the Arrival reflects how deep
 * they went and what they found.
 *
 * Persisted with a versioned, debounced, event-driven write (never per frame),
 * with a private-mode-safe storage fallback.
 */
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { hashStringToSeed } from '@/lib/rng'
import { DEPTHS } from '@/lib/depths'

export interface JourneyData {
  version: 1
  firstSeen: string
  lastSeen: string
  visits: number
  deepestDepth: number
  depthsSeen: boolean[]
  illuminationsFound: string[]
  emberSeed: number
  readingModePreferred: boolean
  lastScrollProgress: number
}

export interface JourneyStore extends JourneyData {
  markDepth: (index: number) => void
  markIllumination: (id: string) => void
  setReadingPreferred: (v: boolean) => void
  setScrollProgress: (p: number) => void
  beginVisit: () => void
  reset: () => void
}

const EMPTY: JourneyData = {
  version: 1,
  firstSeen: '',
  lastSeen: '',
  visits: 0,
  deepestDepth: 0,
  depthsSeen: DEPTHS.map(() => false),
  illuminationsFound: [],
  emberSeed: 1,
  readingModePreferred: false,
  lastScrollProgress: 0,
}

// private-mode-safe storage: falls back to in-memory if localStorage throws
const safeStorage = (): StateStorage => {
  try {
    const probe = '__codex_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    }
  }
}

function nowIso(): string {
  // app runtime (not a workflow) — Date is allowed here
  return new Date().toISOString()
}

export const useJourneyStore = create<JourneyStore>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      beginVisit: () => {
        const s = get()
        const first = s.firstSeen || nowIso()
        set({
          firstSeen: first,
          lastSeen: nowIso(),
          visits: s.visits + 1,
          emberSeed: s.emberSeed > 1 ? s.emberSeed : hashStringToSeed(`codex:${first}`),
        })
      },

      markDepth: (index) => {
        const s = get()
        if (s.depthsSeen[index] && index <= s.deepestDepth) return
        const depthsSeen = s.depthsSeen.slice()
        depthsSeen[index] = true
        set({ depthsSeen, deepestDepth: Math.max(s.deepestDepth, index), lastSeen: nowIso() })
      },

      markIllumination: (id) => {
        const s = get()
        if (s.illuminationsFound.includes(id)) return
        set({ illuminationsFound: [...s.illuminationsFound, id], lastSeen: nowIso() })
      },

      setReadingPreferred: (readingModePreferred) => set({ readingModePreferred }),
      setScrollProgress: (lastScrollProgress) => set({ lastScrollProgress }),

      reset: () => set({ ...EMPTY, firstSeen: nowIso(), visits: 1, emberSeed: hashStringToSeed(`codex:${nowIso()}`) }),
    }),
    {
      name: 'codex.journey.v1',
      version: 1,
      storage: createJSONStorage(safeStorage),
      partialize: (s): JourneyData => ({
        version: s.version,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        visits: s.visits,
        deepestDepth: s.deepestDepth,
        depthsSeen: s.depthsSeen,
        illuminationsFound: s.illuminationsFound,
        emberSeed: s.emberSeed,
        readingModePreferred: s.readingModePreferred,
        lastScrollProgress: s.lastScrollProgress,
      }),
    },
  ),
)
