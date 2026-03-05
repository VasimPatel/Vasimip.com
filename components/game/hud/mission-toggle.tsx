"use client"

import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { useEffect, useState } from "react"

export function MissionToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-8 h-8" />

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)] hover:scale-105 transition-transform"
      aria-label={isDark ? "Switch to Day Mission" : "Switch to Night Mission"}
      title={isDark ? "Day Mission" : "Night Mission"}
    >
      {isDark ? (
        <Moon className="w-4 h-4 text-[var(--comic-blue)]" />
      ) : (
        <Sun className="w-4 h-4 text-[var(--comic-orange)]" />
      )}
      <span className="hidden sm:block font-pixel text-[7px] text-[var(--comic-ink)]">
        {isDark ? "NIGHT" : "DAY"}
      </span>
    </button>
  )
}
