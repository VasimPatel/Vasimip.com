import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AchievementState {
  discovered: string[]
  discover: (achievementId: string) => void
  isDiscovered: (achievementId: string) => boolean
  reset: () => void
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set, get) => ({
      discovered: [],
      discover: (achievementId: string) => {
        const { discovered } = get()
        if (!discovered.includes(achievementId)) {
          set({ discovered: [...discovered, achievementId] })
        }
      },
      isDiscovered: (achievementId: string) => get().discovered.includes(achievementId),
      reset: () => set({ discovered: [] }),
    }),
    {
      name: "comic-rpg-achievements",
    }
  )
)
