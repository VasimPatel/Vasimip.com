"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface NarratorBoxProps {
  children: React.ReactNode
  className?: string
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"
  delay?: number
}

const positionStyles = {
  "top-left": "self-start",
  "top-right": "self-end",
  "bottom-left": "self-start",
  "bottom-right": "self-end",
  center: "self-center",
}

export function NarratorBox({
  children,
  className,
  position = "top-left",
  delay = 0,
}: NarratorBoxProps) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      className={cn(
        "relative inline-block px-5 py-3",
        "bg-[var(--comic-yellow)] text-[var(--comic-panel-border)]",
        "border-2 border-[var(--comic-panel-border)]",
        "font-handwriting text-lg italic",
        "shadow-[2px_2px_0_var(--comic-panel-shadow)]",
        positionStyles[position],
        className
      )}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: reducedMotion ? 0.15 : 0.4, delay: reducedMotion ? 0 : delay }}
    >
      {children}
    </motion.div>
  )
}
