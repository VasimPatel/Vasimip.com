"use client"

import { Volume2, VolumeX } from "lucide-react"
import { useGameStore } from "@/lib/stores/game-store"

export function SoundToggle() {
  const { soundEnabled, toggleSound } = useGameStore()

  return (
    <button
      onClick={toggleSound}
      className="flex items-center px-2 py-1.5 rounded border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)] hover:scale-105 transition-transform"
      aria-label={soundEnabled ? "Mute sounds" : "Unmute sounds"}
      title={soundEnabled ? "Sound On" : "Sound Off"}
    >
      {soundEnabled ? (
        <Volume2 className="w-4 h-4 text-[var(--comic-ink)]" />
      ) : (
        <VolumeX className="w-4 h-4 text-[var(--comic-ink)] opacity-50" />
      )}
    </button>
  )
}
