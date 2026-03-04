"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useNotebookStore } from "@/lib/stores/notebook-store"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface PageFlipContainerProps {
  children: React.ReactNode
  pageKey: string | number
}

export function PageFlipContainer({ children, pageKey }: PageFlipContainerProps) {
  const pageDirection = useNotebookStore((s) => s.pageDirection)
  const reducedMotion = useReducedMotion()

  const variants = reducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (direction: number) => ({
          rotateY: direction > 0 ? 90 : -90,
          opacity: 0,
          scale: 0.95,
        }),
        center: {
          rotateY: 0,
          opacity: 1,
          scale: 1,
        },
        exit: (direction: number) => ({
          rotateY: direction > 0 ? -90 : 90,
          opacity: 0,
          scale: 0.95,
        }),
      }

  return (
    <div className="relative w-full h-full" style={{ perspective: "1500px" }}>
      <AnimatePresence mode="wait" custom={pageDirection}>
        <motion.div
          key={pageKey}
          custom={pageDirection}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            reducedMotion
              ? { duration: 0.15 }
              : {
                  rotateY: { type: "spring", stiffness: 200, damping: 30, duration: 0.5 },
                  opacity: { duration: 0.3 },
                  scale: { duration: 0.4 },
                }
          }
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
