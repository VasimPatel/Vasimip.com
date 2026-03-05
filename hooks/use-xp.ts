"use client"

import { useCallback, useRef } from "react"
import { useGameStore } from "@/lib/stores/game-store"
import { XP_ACTIONS, type XPAction, getLevelForXP } from "@/lib/data/xp-config"

export function useXP() {
  const { xp, level, levelName, addXP } = useGameStore()
  const prevLevelRef = useRef(level)

  const awardXP = useCallback(
    async (action: XPAction) => {
      const amount = XP_ACTIONS[action]
      const oldLevel = getLevelForXP(xp)
      addXP(amount)
      const newLevel = getLevelForXP(xp + amount)

      // Check for level-up
      if (newLevel.level > oldLevel.level) {
        prevLevelRef.current = newLevel.level

        // Trigger confetti for level-up
        try {
          const confetti = (await import("canvas-confetti")).default
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.5 },
            colors: ["#FFD700", "#E63946", "#457B9D", "#2A9D8F", "#7B2D8E"],
          })
        } catch {
          // Non-critical
        }

        return { leveledUp: true, newLevel: newLevel.level, newName: newLevel.name, amount }
      }

      return { leveledUp: false, amount }
    },
    [xp, addXP]
  )

  return { xp, level, levelName, awardXP }
}
