"use client"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface BreakablePanelProps {
  children: React.ReactNode
  /** Content revealed after breaking */
  hiddenContent: React.ReactNode
  className?: string
  /** Clicks needed to break (default 5) */
  clicksToBreak?: number
  onBreak?: () => void
}

interface Fragment {
  id: number
  x: number
  y: number
  width: number
  height: number
  vx: number
  vy: number
  rotate: number
}

export function BreakablePanel({
  children,
  hiddenContent,
  className,
  clicksToBreak = 5,
  onBreak,
}: BreakablePanelProps) {
  const [clicks, setClicks] = useState(0)
  const [broken, setBroken] = useState(false)
  const [fragments, setFragments] = useState<Fragment[]>([])
  const reducedMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastClickTime = useRef(0)

  // Crack lines SVG paths based on click count
  const crackPaths = [
    "M 50% 0% L 55% 30% L 45% 60% L 52% 100%",
    "M 0% 40% L 30% 45% L 60% 38% L 100% 42%",
    "M 80% 0% L 70% 35% L 85% 65% L 75% 100%",
    "M 0% 70% L 25% 65% L 55% 75% L 100% 68%",
  ]

  const handleClick = useCallback(() => {
    const now = Date.now()
    // Require rapid clicking (within 800ms)
    if (now - lastClickTime.current > 800 && clicks > 0) {
      setClicks(0) // Reset if too slow
    }
    lastClickTime.current = now

    const newClicks = clicks + 1
    setClicks(newClicks)

    if (newClicks >= clicksToBreak) {
      // SHATTER!
      const rect = panelRef.current?.getBoundingClientRect()
      if (rect) {
        const frags: Fragment[] = []
        const cols = 3
        const rows = 3
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            frags.push({
              id: r * cols + c,
              x: (rect.width / cols) * c,
              y: (rect.height / rows) * r,
              width: rect.width / cols,
              height: rect.height / rows,
              vx: (c - 1) * (200 + Math.random() * 300),
              vy: (r - 1) * (200 + Math.random() * 300) - 200,
              rotate: (Math.random() - 0.5) * 720,
            })
          }
        }
        setFragments(frags)
      }
      setBroken(true)
      onBreak?.()
    }
  }, [clicks, clicksToBreak, onBreak])

  if (reducedMotion) {
    return (
      <div className={cn("relative", className)}>
        {!broken ? (
          <div className="relative bg-[var(--comic-panel)] comic-ink-border p-4">
            {children}
            <button
              onClick={() => { setBroken(true); onBreak?.() }}
              className="absolute top-2 right-2 font-pixel text-[7px] text-[var(--comic-ink)] opacity-50 hover:opacity-100"
            >
              [BREAK]
            </button>
          </div>
        ) : (
          <motion.div
            className="bg-[var(--comic-panel)] comic-ink-border p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {hiddenContent}
          </motion.div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="wait">
        {!broken ? (
          <motion.div
            key="panel"
            ref={panelRef}
            className="relative bg-[var(--comic-panel)] comic-ink-border p-4 cursor-pointer select-none overflow-hidden"
            onClick={handleClick}
            whileTap={{ scale: 0.98 }}
            animate={clicks > 0 ? {
              x: [0, -2, 2, -1, 1, 0],
              transition: { duration: 0.3 }
            } : {}}
            exit={{ opacity: 0 }}
          >
            {children}

            {/* Crack lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
              {crackPaths.slice(0, clicks).map((_, i) => (
                <motion.line
                  key={i}
                  x1={`${20 + i * 20}%`}
                  y1="0%"
                  x2={`${30 + i * 15}%`}
                  y2="100%"
                  stroke="var(--comic-ink)"
                  strokeWidth={1.5}
                  opacity={0.4 + (i * 0.15)}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.2 }}
                />
              ))}
            </svg>

            {/* Click hint */}
            {clicks > 0 && clicks < clicksToBreak && (
              <div className="absolute bottom-1 right-2 font-pixel text-[7px] text-[var(--comic-red)] opacity-60">
                {clicksToBreak - clicks} more...
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="revealed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            {/* Flying fragments */}
            {fragments.map((frag) => (
              <motion.div
                key={frag.id}
                className="absolute bg-[var(--comic-panel)] border border-[var(--comic-panel-border)]"
                style={{
                  left: frag.x,
                  top: frag.y,
                  width: frag.width,
                  height: frag.height,
                }}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{
                  x: frag.vx,
                  y: frag.vy,
                  rotate: frag.rotate,
                  opacity: 0,
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            ))}

            {/* Revealed content */}
            <motion.div
              className="bg-[var(--comic-panel)] comic-ink-border p-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 20 }}
            >
              {hiddenContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
