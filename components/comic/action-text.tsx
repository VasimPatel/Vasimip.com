"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ActionTextProps {
  text: string
  color?: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  rotate?: number
}

const sizeClasses = {
  sm: "text-2xl sm:text-3xl",
  md: "text-3xl sm:text-5xl",
  lg: "text-5xl sm:text-7xl",
  xl: "text-6xl sm:text-9xl",
}

export function ActionText({
  text,
  color = "var(--comic-yellow)",
  size = "md",
  className,
  rotate = -3,
}: ActionTextProps) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      className={cn(
        "font-comic comic-text-outline inline-block select-none",
        sizeClasses[size],
        className
      )}
      style={{ color, rotate: `${rotate}deg` }}
      initial={
        reducedMotion
          ? { opacity: 0 }
          : { scale: 0, rotate: rotate - 12, opacity: 0 }
      }
      animate={
        reducedMotion
          ? { opacity: 1 }
          : { scale: 1, rotate, opacity: 1 }
      }
      transition={
        reducedMotion
          ? { duration: 0.15 }
          : {
              type: "spring",
              stiffness: 400,
              damping: 12,
              duration: 0.5,
            }
      }
      aria-live="polite"
    >
      {text}
    </motion.div>
  )
}
