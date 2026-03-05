"use client"

import { motion } from "framer-motion"
import { useGameStore } from "@/lib/stores/game-store"
import { getXPToNextLevel } from "@/lib/data/xp-config"

export function XPBar() {
  const { xp, level, levelName } = useGameStore()
  const { progress } = getXPToNextLevel(xp)

  return (
    <div className="flex items-center gap-2">
      {/* Level badge */}
      <div className="flex items-center gap-1.5 min-w-fit">
        <span className="font-pixel text-[8px] sm:text-[10px] text-[var(--comic-yellow)]">
          LV{level}
        </span>
      </div>

      {/* XP bar */}
      <div className="relative h-3 w-24 sm:w-32 overflow-hidden rounded-sm border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ backgroundColor: "var(--comic-yellow)" }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-pixel text-[6px] text-[var(--comic-ink)] mix-blend-difference">
            {xp} XP
          </span>
        </div>
      </div>

      {/* Level name — hidden on mobile */}
      <span className="hidden sm:block font-pixel text-[7px] text-[var(--comic-ink)] opacity-70 truncate max-w-20">
        {levelName}
      </span>
    </div>
  )
}
