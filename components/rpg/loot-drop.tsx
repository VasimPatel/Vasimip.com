"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface LootDropProps {
  children: React.ReactNode
  label?: string
  onReveal?: () => void
  className?: string
}

export function LootDrop({
  children,
  label = "Loot Drop!",
  onReveal,
  className,
}: LootDropProps) {
  const [revealed, setRevealed] = useState(false)
  const reducedMotion = useReducedMotion()

  const handlePeel = () => {
    if (revealed) return
    setRevealed(true)
    onReveal?.()
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence>
        {!revealed && (
          <motion.button
            onClick={handlePeel}
            className="w-full px-5 py-4 border-3 border-[var(--comic-panel-border)] bg-gradient-to-br from-[var(--comic-yellow)] to-[var(--comic-orange)] text-[var(--comic-panel-border)] font-comic text-lg cursor-pointer hover:scale-[1.02] transition-transform"
            style={{ boxShadow: "4px 4px 0 var(--comic-panel-shadow)" }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { rotateX: 90, opacity: 0, y: -20 }
            }
            transition={{ duration: 0.4 }}
            aria-label="Click to reveal loot"
          >
            🎁 {label}
          </motion.button>
        )}
      </AnimatePresence>

      {revealed && (
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 10 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="w-full p-4 border-3 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]"
          style={{ boxShadow: "4px 4px 0 var(--comic-panel-shadow)" }}
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}
