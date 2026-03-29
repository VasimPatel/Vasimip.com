"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ComicPanelProps {
  children: React.ReactNode
  className?: string
  variant?: "default" | "splash" | "inset" | "tilted"
  delay?: number
  noBorder?: boolean
}

export function ComicPanel({
  children,
  className,
  variant = "default",
  delay = 0,
  noBorder = false,
}: ComicPanelProps) {
  const reducedMotion = useReducedMotion()

  const variantStyles = {
    default: "",
    splash: "col-span-full",
    inset: "m-2",
    tilted: "rotate-[-1deg] hover:rotate-0 transition-transform",
  }

  return (
    <motion.div
      className={cn(
        "relative overflow-hidden bg-[var(--comic-panel)]",
        !noBorder && "comic-ink-border",
        variantStyles[variant],
        className
      )}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
      whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: reducedMotion ? 0.15 : 0.5,
        delay: reducedMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  )
}
