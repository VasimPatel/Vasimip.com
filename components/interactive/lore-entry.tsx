"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface LoreEntryProps {
  title: string
  children: React.ReactNode
  icon?: string
  className?: string
  onExpand?: () => void
}

export function LoreEntry({ title, children, icon = "📜", className, onExpand }: LoreEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const reducedMotion = useReducedMotion()

  const toggle = () => {
    const wasExpanded = expanded
    setExpanded(!expanded)
    if (!wasExpanded) onExpand?.()
  }

  return (
    <div className={cn("border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)] overflow-hidden", className)}>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--comic-halftone)] transition-colors"
        aria-expanded={expanded}
      >
        <span className="text-xl flex-shrink-0">{icon}</span>
        <span className="font-comic text-lg text-[var(--comic-ink)] flex-1">{title}</span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-[var(--comic-ink)] opacity-60" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.15 : 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-[var(--comic-halftone)]">
              <div className="font-handwriting text-base text-[var(--comic-ink)] leading-relaxed">
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
