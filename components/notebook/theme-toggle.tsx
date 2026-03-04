"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="fixed top-4 right-4 z-50 p-2 rounded-full bg-[var(--notebook-paper)] shadow-lg border border-[var(--notebook-ink)]/20 hover:scale-110 transition-transform"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <motion.div
        animate={isDark ? { rotate: 0 } : { rotate: -20 }}
        transition={{ type: "spring", stiffness: 200 }}
      >
        {isDark ? (
          // Desk lamp ON
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="var(--notebook-ink)" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21h6M12 21v-4M8 17h8" />
            <path d="M6 17l2-10h8l2 10" />
            {/* Light rays */}
            <line x1="12" y1="1" x2="12" y2="3" className="stroke-yellow-400" />
            <line x1="5" y1="4" x2="6.5" y2="5.5" className="stroke-yellow-400" />
            <line x1="19" y1="4" x2="17.5" y2="5.5" className="stroke-yellow-400" />
          </svg>
        ) : (
          // Desk lamp OFF
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="var(--notebook-ink)" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21h6M12 21v-4M8 17h8" />
            <path d="M6 17l2-10h8l2 10" />
          </svg>
        )}
      </motion.div>
    </button>
  )
}
