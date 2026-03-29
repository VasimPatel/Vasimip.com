"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface RewardToastProps {
  show: boolean
  text: string
  icon?: string
  onComplete?: () => void
}

export function RewardToast({ show, text, icon = "⭐", onComplete }: RewardToastProps) {
  const reducedMotion = useReducedMotion()

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {show && (
        <motion.div
          className="fixed top-20 left-1/2 z-[80] flex items-center gap-2 px-5 py-3 rounded border-2 border-[var(--comic-panel-border)] bg-[var(--comic-yellow)] text-[var(--comic-panel-border)] shadow-lg"
          initial={
            reducedMotion
              ? { opacity: 0, x: "-50%" }
              : { opacity: 0, y: -20, x: "-50%", scale: 0.8 }
          }
          animate={
            reducedMotion
              ? { opacity: 1, x: "-50%" }
              : { opacity: 1, y: 0, x: "-50%", scale: 1 }
          }
          exit={
            reducedMotion
              ? { opacity: 0, x: "-50%" }
              : { opacity: 0, y: -20, x: "-50%", scale: 0.8 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <span className="text-xl">{icon}</span>
          <span className="font-comic text-lg">{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
