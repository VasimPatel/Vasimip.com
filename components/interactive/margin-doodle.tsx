"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface MarginDoodleProps {
  type: "star" | "heart" | "spiral" | "arrow" | "lightbulb" | "coffee"
  className?: string
  delay?: number
}

const DOODLE_PATHS: Record<string, string> = {
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  spiral: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.85 0 3.58-.51 5.06-1.38C15.13 19.5 12 16.5 12 13c0-2.21 1.79-4 4-4 1.5 0 2.79.83 3.47 2.05.34-.97.53-2.01.53-3.05C20 6.48 15.52 2 12 2z",
  arrow: "M5 12h14M12 5l7 7-7 7",
  lightbulb: "M9 21h6M12 3a6 6 0 016 6c0 2.22-1.21 4.16-3 5.2V17a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2.8C7.21 13.16 6 11.22 6 9a6 6 0 016-6z",
  coffee: "M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3",
}

export function MarginDoodle({ type, className, delay = 0 }: MarginDoodleProps) {
  const reducedMotion = useReducedMotion()
  const path = DOODLE_PATHS[type]
  if (!path) return null

  return (
    <motion.div
      className={cn("absolute pointer-events-none", className)}
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.5 }}
      animate={{ opacity: 0.4, scale: 1 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { delay, duration: 0.5, type: "spring", stiffness: 200 }
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="w-6 h-6"
        fill="none"
        stroke="var(--notebook-ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "url(#hand-drawn)" }}
      >
        <path d={path} />
      </svg>
    </motion.div>
  )
}
