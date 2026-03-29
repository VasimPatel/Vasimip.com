"use client"

import { Trophy } from "lucide-react"
import { useAchievementStore } from "@/lib/stores/achievement-store"
import { ACHIEVEMENTS } from "@/lib/data/achievements"

export function AchievementTracker() {
  const discovered = useAchievementStore((s) => s.discovered)

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5 rounded border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]"
      title={`${discovered.length}/${ACHIEVEMENTS.length} achievements`}
    >
      <Trophy className="w-4 h-4 text-[var(--comic-yellow)]" />
      <span className="font-pixel text-[8px] text-[var(--comic-ink)]">
        {discovered.length}/{ACHIEVEMENTS.length}
      </span>
    </div>
  )
}
