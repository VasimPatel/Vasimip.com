"use client"

import { StatBar } from "./stat-bar"
import { ComicPanel } from "@/components/comic/comic-panel"
import { useGameStore } from "@/lib/stores/game-store"

interface RPGStat {
  name: string
  abbr: string
  value: number
  color: string
}

const RPG_STATS: RPGStat[] = [
  { name: "Strength", abbr: "STR", value: 88, color: "var(--comic-red)" },
  { name: "Dexterity", abbr: "DEX", value: 92, color: "var(--comic-orange)" },
  { name: "Intelligence", abbr: "INT", value: 90, color: "var(--comic-blue)" },
  { name: "Charisma", abbr: "CHA", value: 78, color: "var(--comic-purple)" },
  { name: "Vitality", abbr: "VIT", value: 85, color: "var(--comic-green)" },
  { name: "Luck", abbr: "LCK", value: 72, color: "var(--comic-yellow)" },
]

export function CharacterSheet() {
  const { level, levelName, xp } = useGameStore()

  return (
    <ComicPanel className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-comic text-3xl text-[var(--comic-ink)]">VASIM PATEL</h3>
          <p className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-70">
            {levelName} &bull; Level {level} &bull; {xp} XP
          </p>
        </div>
        <div className="flex items-center justify-center w-14 h-14 rounded-full border-3 border-[var(--comic-panel-border)] bg-[var(--comic-yellow)] font-comic text-2xl text-[var(--comic-panel-border)]">
          {level}
        </div>
      </div>

      {/* Class */}
      <div className="mb-4 px-3 py-1.5 inline-block border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]">
        <span className="font-pixel text-[8px] text-[var(--comic-ink)]">
          CLASS: FULL-STACK DEVELOPER
        </span>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-2">
        {RPG_STATS.map((stat, i) => (
          <StatBar
            key={stat.abbr}
            label={stat.abbr}
            value={stat.value}
            color={stat.color}
            delay={i * 0.1}
          />
        ))}
      </div>
    </ComicPanel>
  )
}
