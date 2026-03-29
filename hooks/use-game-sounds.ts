"use client"

import { useCallback } from "react"
import { useGameStore } from "@/lib/stores/game-store"

type SoundEffect = "click" | "level-up" | "transition" | "achievement" | "dialogue-blip" | "quest-complete"

// Simple sound hook — plays audio elements
// Sound files in public/sounds/ are optional; fails silently if missing
export function useGameSounds() {
  const soundEnabled = useGameStore((s) => s.soundEnabled)

  const play = useCallback(
    (sound: SoundEffect) => {
      if (!soundEnabled) return
      try {
        const audio = new Audio(`/sounds/${sound}.mp3`)
        audio.volume = 0.3
        audio.play().catch(() => {
          // Audio play can fail if user hasn't interacted yet — non-critical
        })
      } catch {
        // Non-critical
      }
    },
    [soundEnabled]
  )

  return { play }
}
