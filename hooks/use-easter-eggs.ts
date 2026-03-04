"use client"

import { useCallback } from "react"
import { useEasterEggStore } from "@/lib/stores/easter-egg-store"
import { EASTER_EGGS } from "@/lib/data/easter-eggs"

export function useEasterEggs() {
  const { discovered, discover, isDiscovered } = useEasterEggStore()

  const discoverEgg = useCallback(
    async (eggId: string) => {
      if (isDiscovered(eggId)) return
      discover(eggId)

      // Trigger confetti celebration
      try {
        const confetti = (await import("canvas-confetti")).default
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.7 },
          colors: ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6"],
        })
      } catch {
        // Confetti is non-critical
      }
    },
    [discover, isDiscovered]
  )

  return {
    discovered,
    discoverEgg,
    isDiscovered,
    totalFound: discovered.length,
    totalEggs: EASTER_EGGS.length,
  }
}
