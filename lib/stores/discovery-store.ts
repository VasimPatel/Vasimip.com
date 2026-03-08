import { create } from "zustand"
import { persist } from "zustand/middleware"

interface DiscoveryState {
  discoveredSecrets: string[]
  journalOpen: boolean
  lastDiscovered: string | null

  discover: (secretId: string) => void
  isDiscovered: (secretId: string) => boolean
  openJournal: () => void
  closeJournal: () => void
  toggleJournal: () => void
  clearLastDiscovered: () => void
  reset: () => void
}

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      discoveredSecrets: [],
      journalOpen: false,
      lastDiscovered: null,

      discover: (secretId: string) => {
        const { discoveredSecrets } = get()
        if (!discoveredSecrets.includes(secretId)) {
          set({
            discoveredSecrets: [...discoveredSecrets, secretId],
            lastDiscovered: secretId,
          })
        }
      },

      isDiscovered: (secretId: string) =>
        get().discoveredSecrets.includes(secretId),

      openJournal: () => set({ journalOpen: true }),
      closeJournal: () => set({ journalOpen: false }),
      toggleJournal: () => set({ journalOpen: !get().journalOpen }),
      clearLastDiscovered: () => set({ lastDiscovered: null }),

      reset: () =>
        set({
          discoveredSecrets: [],
          journalOpen: false,
          lastDiscovered: null,
        }),
    }),
    {
      name: "comic-rpg-discoveries",
      partialize: (state) => ({
        discoveredSecrets: state.discoveredSecrets,
      }),
    }
  )
)
