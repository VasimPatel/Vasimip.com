"use client"

import { useRef, useState, useEffect } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface InkRevealProps {
  children: React.ReactNode
  className?: string
  direction?: "left" | "right" | "bottom" | "center"
  delay?: number
}

function getClipPaths(direction: string): [string, string] {
  switch (direction) {
    case "left":
      return ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]
    case "right":
      return ["inset(0 0 0 100%)", "inset(0 0 0 0%)"]
    case "bottom":
      return ["inset(0 0 100% 0)", "inset(0 0 0% 0)"]
    case "center":
    default:
      return ["circle(0% at 50% 50%)", "circle(75% at 50% 50%)"]
  }
}

export function InkReveal({
  children,
  className,
  direction = "center",
  delay = 0,
}: InkRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const reducedMotion = useReducedMotion()

  // Use IntersectionObserver for reliable detection in any scroll container
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [clipFrom, clipTo] = getClipPaths(direction)

  if (reducedMotion) {
    return (
      <motion.div
        ref={ref}
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <motion.div
        initial={{ clipPath: clipFrom, opacity: 0 }}
        animate={
          isVisible
            ? { clipPath: clipTo, opacity: 1 }
            : { clipPath: clipFrom, opacity: 0 }
        }
        transition={{
          clipPath: {
            duration: 0.8,
            delay: delay * 2,
            ease: [0.22, 1, 0.36, 1],
          },
          opacity: {
            duration: 0.4,
            delay: delay * 2,
          },
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
