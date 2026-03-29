"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface QuestObjectiveProps {
  children: React.ReactNode
  completed?: boolean
  className?: string
}

export function QuestObjective({ children, completed: initialCompleted = false, className }: QuestObjectiveProps) {
  const [completed, setCompleted] = useState(initialCompleted)

  return (
    <button
      onClick={() => setCompleted(!completed)}
      className={cn(
        "flex items-start gap-3 text-left w-full py-1.5 group",
        className
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-5 h-5 mt-0.5 border-2 border-[var(--comic-panel-border)] flex items-center justify-center transition-colors",
          completed ? "bg-[var(--comic-green)]" : "bg-[var(--comic-panel)]"
        )}
      >
        {completed && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-xs text-white font-bold"
          >
            ✓
          </motion.span>
        )}
      </div>
      <span
        className={cn(
          "font-handwriting text-base text-[var(--comic-ink)] transition-opacity",
          completed && "line-through opacity-50"
        )}
      >
        {children}
      </span>
    </button>
  )
}
