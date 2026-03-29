"use client"

import { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface PatienceRevealProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

export function PatienceReveal({
  children,
  className,
  delay = 5000,
}: PatienceRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true)
      return
    }

    const el = ref.current
    if (!el || revealed) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timerRef.current = setTimeout(() => {
            setRevealed(true)
          }, delay)
        } else {
          if (timerRef.current) clearTimeout(timerRef.current)
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(el)

    return () => {
      observer.disconnect()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [delay, revealed, reducedMotion])

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: revealed ? 1 : 0 }}
      transition={{ duration: 2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
