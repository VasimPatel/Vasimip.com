"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface FoldOutSectionProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function FoldOutSection({ label, children, className }: FoldOutSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const reducedMotion = useReducedMotion()

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] hover:text-[var(--notebook-accent)] transition-colors"
        aria-expanded={isOpen}
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-block text-sm"
        >
          ▶
        </motion.span>
        {label}
        <span className="text-xs opacity-50">(unfold)</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { scaleY: 0, opacity: 0, originY: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { scaleY: 1, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { scaleY: 0, opacity: 0 }}
            transition={
              reducedMotion
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 200, damping: 25 }
            }
            className="overflow-hidden border-l-2 border-dashed border-[var(--notebook-ink)] ml-2 pl-4 mt-2"
            style={{ transformOrigin: "top" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
