import { create } from "zustand"
import { persist } from "zustand/middleware"

interface WorldState {
  currentPassage: number
  visitedPassages: number[]
  isReturningVisitor: boolean
  scrollDepth: number

  setPassage: (n: number) => void
  markVisited: (n: number) => void
  setScrollDepth: (d: number) => void
}

export const useWorldStore = create<WorldState>()(
  persist(
    (set, get) => ({
      currentPassage: 0,
      visitedPassages: [],
      isReturningVisitor: false,
      scrollDepth: 0,

      setPassage: (n: number) => {
        const { visitedPassages } = get()
        const newVisited = visitedPassages.includes(n)
          ? visitedPassages
          : [...visitedPassages, n]
        set({ currentPassage: n, visitedPassages: newVisited })
      },

      markVisited: (n: number) => {
        const { visitedPassages } = get()
        if (!visitedPassages.includes(n)) {
          set({ visitedPassages: [...visitedPassages, n] })
        }
      },

      setScrollDepth: (d: number) => set({ scrollDepth: d }),
    }),
    {
      name: "ink-ember-world",
      partialize: (state) => ({
        visitedPassages: state.visitedPassages,
      }),
      onRehydrateStorage: () => (state) => {
        // Only mark as returning if they actually visited passages in this version
        if (state && state.visitedPassages.length > 0) {
          state.isReturningVisitor = true
        }
      },
    }
  )
)
