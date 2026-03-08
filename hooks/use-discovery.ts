"use client"

import { useCallback } from "react"
import { useDiscoveryStore } from "@/lib/stores/discovery-store"
import { useGameStore } from "@/lib/stores/game-store"
import { useAchievements } from "@/hooks/use-achievements"
import { SECRETS, getSecretsForZone } from "@/lib/data/secrets"

export function useDiscovery() {
  const {
    discoveredSecrets,
    discover: storeDiscover,
    isDiscovered,
    lastDiscovered,
    clearLastDiscovered,
    openJournal,
    closeJournal,
    toggleJournal,
    journalOpen,
  } = useDiscoveryStore()

  const { addXP } = useGameStore()
  const { discoverAchievement } = useAchievements()

  const discoverSecret = useCallback(
    async (secretId: string) => {
      if (isDiscovered(secretId)) return false

      const secret = SECRETS.find((s) => s.id === secretId)
      if (!secret) return false

      storeDiscover(secretId)

      // Award XP
      if (secret.xpReward > 0) {
        addXP(secret.xpReward)
      }

      // Trigger linked achievement
      if (secret.achievementId) {
        discoverAchievement(secret.achievementId)
      }

      // Confetti burst for discovery
      try {
        const confetti = (await import("canvas-confetti")).default
        confetti({
          particleCount: 60,
          spread: 50,
          origin: { y: 0.7 },
          colors: ["#FFD700", "#F77F00", "#2A9D8F"],
          ticks: 80,
        })
      } catch {
        // non-critical
      }

      return true
    },
    [isDiscovered, storeDiscover, addXP, discoverAchievement]
  )

  const getZoneProgress = useCallback(
    (zoneId: string) => {
      const zoneSecrets = getSecretsForZone(zoneId)
      const found = zoneSecrets.filter((s) => isDiscovered(s.id))
      return {
        total: zoneSecrets.length,
        found: found.length,
        complete: found.length === zoneSecrets.length,
        secrets: zoneSecrets,
      }
    },
    [isDiscovered]
  )

  return {
    discoveredSecrets,
    discoverSecret,
    isDiscovered,
    lastDiscovered,
    clearLastDiscovered,
    openJournal,
    closeJournal,
    toggleJournal,
    journalOpen,
    totalFound: discoveredSecrets.length,
    totalSecrets: SECRETS.length,
    getZoneProgress,
  }
}
