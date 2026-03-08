"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ParallaxLayerProps {
  children?: React.ReactNode
  /** Scroll speed multiplier (0 = fixed, 1 = normal, <1 = slow/background) */
  speed?: number
  className?: string
}

export function ParallaxLayer({ children, speed = 0.5, className }: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const y = useTransform(scrollYProgress, [0, 1], [0, (1 - speed) * -200])

  if (reducedMotion) {
    return <div className={cn("relative", className)}>{children}</div>
  }

  return (
    <motion.div ref={ref} style={{ y }} className={cn("relative", className)}>
      {children}
    </motion.div>
  )
}
