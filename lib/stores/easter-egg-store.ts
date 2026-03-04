import { create } from "zustand"
import { persist } from "zustand/middleware"

interface EasterEggState {
  discovered: string[]
  discover: (eggId: string) => void
  isDiscovered: (eggId: string) => boolean
  totalDiscovered: number
  reset: () => void
}

export const useEasterEggStore = create<EasterEggState>()(
  persist(
    (set, get) => ({
      discovered: [],
      discover: (eggId: string) => {
        const { discovered } = get()
        if (!discovered.includes(eggId)) {
          set({ discovered: [...discovered, eggId] })
        }
      },
      isDiscovered: (eggId: string) => get().discovered.includes(eggId),
      get totalDiscovered() {
        return get().discovered.length
      },
      reset: () => set({ discovered: [] }),
    }),
    {
      name: "notebook-easter-eggs",
    }
  )
)
