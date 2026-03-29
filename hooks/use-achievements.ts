"use client"

import { useCallback } from "react"
import { useAchievementStore } from "@/lib/stores/achievement-store"
import { useGameStore } from "@/lib/stores/game-store"
import { ACHIEVEMENTS } from "@/lib/data/achievements"

export function useAchievements() {
  const { discovered, discover, isDiscovered } = useAchievementStore()
  const { addXP, addToInventory } = useGameStore()

  const discoverAchievement = useCallback(
    async (achievementId: string) => {
      if (isDiscovered(achievementId)) return

      const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId)
      if (!achievement) return

      discover(achievementId)

      // Award XP
      if (achievement.xpReward > 0) {
        addXP(achievement.xpReward)
      }

      // Award item
      if (achievement.itemReward) {
        addToInventory(achievement.itemReward)
      }

      // Trigger confetti
      try {
        const confetti = (await import("canvas-confetti")).default
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#FFD700", "#E63946", "#457B9D", "#2A9D8F", "#7B2D8E", "#F77F00"],
        })
      } catch {
        // Confetti is non-critical
      }
    },
    [discover, isDiscovered, addXP, addToInventory]
  )

  return {
    discovered,
    discoverAchievement,
    isDiscovered,
    totalFound: discovered.length,
    totalAchievements: ACHIEVEMENTS.length,
  }
}
