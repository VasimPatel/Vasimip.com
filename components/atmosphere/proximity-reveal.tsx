"use client"

import { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { usePresenceStore } from "@/lib/stores/presence-store"

interface ProximityRevealProps {
  children: React.ReactNode
  className?: string
  radius?: number
}

export function ProximityReveal({
  children,
  className,
  radius = 60,
}: ProximityRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true)
      return
    }

    const check = () => {
      const el = ref.current
      if (!el || revealed) return

      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const store = usePresenceStore.getState()
      const dx = store.cursorX - cx
      const dy = store.cursorY - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < radius) {
        setRevealed(true)
      }
    }

    const interval = setInterval(check, 100)
    return () => clearInterval(interval)
  }, [radius, revealed, reducedMotion])

  return (
    <motion.div
      ref={ref}
      className={cn("font-caveat", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: revealed ? 1 : 0 }}
      transition={{ duration: 2, ease: "easeOut" }}
      style={{ color: "var(--ember)" }}
    >
      {children}
    </motion.div>
  )
}
