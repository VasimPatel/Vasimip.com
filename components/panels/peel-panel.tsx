"use client"

import { useState, useRef } from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface PeelPanelProps {
  children: React.ReactNode
  /** Content hidden under the peel */
  hiddenContent: React.ReactNode
  className?: string
  onPeel?: () => void
}

export function PeelPanel({ children, hiddenContent, className, onPeel }: PeelPanelProps) {
  const [peeled, setPeeled] = useState(false)
  const reducedMotion = useReducedMotion()
  const constraintRef = useRef<HTMLDivElement>(null)

  // Drag value for corner
  const dragX = useMotionValue(0)

  // Map drag distance to rotation
  const rotateY = useTransform(dragX, [0, -200], [0, -60])
  const shadowOpacity = useTransform(dragX, [0, -200], [0, 0.3])

  const handleDragEnd = () => {
    const current = dragX.get()
    if (current < -80) {
      setPeeled(true)
      onPeel?.()
    } else {
      dragX.set(0)
    }
  }

  if (reducedMotion) {
    return (
      <div className={cn("relative", className)}>
        {!peeled ? (
          <div className="relative bg-[var(--comic-panel)] comic-ink-border p-4">
            {children}
            <button
              onClick={() => { setPeeled(true); onPeel?.() }}
              className="absolute bottom-2 right-2 font-pixel text-[7px] text-[var(--comic-ink)] opacity-50 hover:opacity-100"
            >
              [PEEL]
            </button>
          </div>
        ) : (
          <div className="bg-[var(--comic-panel)] comic-ink-border p-4">
            {hiddenContent}
          </div>
        )}
      </div>
    )
  }

  if (peeled) {
    return (
      <motion.div
        className={cn("bg-[var(--comic-panel)] comic-ink-border p-4", className)}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {hiddenContent}
      </motion.div>
    )
  }

  return (
    <div className={cn("relative", className)} ref={constraintRef} style={{ perspective: 800 }}>
      {/* Hidden content underneath */}
      <div className="absolute inset-0 bg-[var(--comic-panel)] comic-ink-border p-4 opacity-30">
        {hiddenContent}
      </div>

      {/* Peelable top layer */}
      <motion.div
        className="relative bg-[var(--comic-panel)] comic-ink-border p-4 origin-left"
        style={{ rotateY }}
      >
        {children}

        {/* Drag handle at bottom-right corner */}
        <motion.div
          className="absolute bottom-0 right-0 w-12 h-12 cursor-grab active:cursor-grabbing z-10"
          drag="x"
          dragConstraints={{ left: -200, right: 0 }}
          dragElastic={0.05}
          style={{ x: dragX }}
          onDragEnd={handleDragEnd}
        >
          {/* Corner curl visual */}
          <svg viewBox="0 0 48 48" className="w-full h-full" aria-hidden="true">
            <path
              d="M48 0 L48 48 L0 48 Z"
              fill="var(--comic-bg)"
              stroke="var(--comic-panel-border)"
              strokeWidth="1.5"
            />
            <text x="30" y="38" fontSize="8" fill="var(--comic-ink)" opacity="0.4" fontFamily="var(--font-press-start)">
              ↖
            </text>
          </svg>
        </motion.div>
      </motion.div>

      {/* Shadow under the peel */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to left, rgba(0,0,0,0.1) 0%, transparent 50%)",
          opacity: shadowOpacity,
        }}
      />
    </div>
  )
}
