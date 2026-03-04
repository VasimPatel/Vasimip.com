"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface StickyNoteProps {
  content: React.ReactNode
  hiddenContent: React.ReactNode
  color?: string
  className?: string
  onPeel?: () => void
}

export function StickyNote({
  content,
  hiddenContent,
  color = "#fff9b1",
  className,
  onPeel,
}: StickyNoteProps) {
  const [isPeeled, setIsPeeled] = useState(false)
  const reducedMotion = useReducedMotion()

  const handlePeel = () => {
    setIsPeeled(true)
    onPeel?.()
  }

  return (
    <div className={cn("relative", className)}>
      {/* Hidden content underneath */}
      <div className="p-3 text-sm text-[var(--notebook-ink)] opacity-70 italic font-[var(--font-caveat)] text-lg">
        {hiddenContent}
      </div>

      {/* Sticky note */}
      <AnimatePresence>
        {!isPeeled && (
          <motion.button
            onClick={handlePeel}
            className="absolute inset-0 cursor-pointer p-4 text-left shadow-md"
            style={{
              backgroundColor: color,
              transformOrigin: "top left",
            }}
            initial={false}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    rotateX: -120,
                    opacity: 0,
                    y: -20,
                  }
            }
            transition={{ duration: 0.5, ease: "easeInOut" }}
            whileHover={
              reducedMotion
                ? {}
                : {
                    rotateX: -8,
                    y: -2,
                    transition: { duration: 0.2 },
                  }
            }
            aria-label="Peel sticky note to reveal hidden content"
          >
            <div className="font-[var(--font-caveat)] text-lg text-gray-800 leading-snug">
              {content}
            </div>
            <div className="absolute bottom-1 right-2 text-[10px] text-gray-400">
              (click to peel)
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
