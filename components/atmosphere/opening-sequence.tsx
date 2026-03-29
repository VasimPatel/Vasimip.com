"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useWorldStore } from "@/lib/stores/world-store"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function OpeningSequence() {
  const [phase, setPhase] = useState<"black" | "ember" | "prompt" | "fading" | "done">("black")
  const isReturning = useWorldStore((s) => s.isReturningVisitor)
  const reducedMotion = useReducedMotion()

  const dismiss = useCallback(() => {
    if (phase === "ember" || phase === "prompt") {
      setPhase("fading")
    }
  }, [phase])

  useEffect(() => {
    if (reducedMotion) {
      setPhase("done")
      return
    }

    const t1 = setTimeout(() => setPhase("ember"), 800)
    const t2 = setTimeout(() => setPhase("prompt"), 2000)
    const t3 = setTimeout(() => setPhase("fading"), 5000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [reducedMotion])

  // After fading phase, fully remove
  useEffect(() => {
    if (phase === "fading") {
      const t = setTimeout(() => setPhase("done"), 1500)
      return () => clearTimeout(t)
    }
  }, [phase])

  // Dismiss on click or touch (matches the lamp ignition)
  useEffect(() => {
    if (phase === "done" || phase === "fading") return

    const handler = () => dismiss()
    window.addEventListener("click", handler, { once: true })
    window.addEventListener("touchstart", handler, { once: true })

    return () => {
      window.removeEventListener("click", handler)
      window.removeEventListener("touchstart", handler)
    }
  }, [phase, dismiss])

  if (phase === "done") return null

  return (
    <motion.div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ backgroundColor: "var(--void)" }}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
    >
      {/* Ember glow */}
      <AnimatePresence>
        {(phase === "ember" || phase === "prompt") && (
          <motion.div
            key="glow"
            className="absolute"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0, 0.6, 0.4, 0.6],
              scale: [0.8, 1, 0.95, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeInOut" }}
            style={{
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(212,160,84,0.3) 0%, rgba(212,160,84,0.05) 50%, transparent 70%)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Prompt text */}
      <AnimatePresence>
        {phase === "prompt" && (
          <motion.p
            key="prompt"
            className="absolute font-sans text-lg tracking-wide select-none"
            style={{
              color: "var(--ember)",
              left: "30%",
              top: "55%",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            {isReturning ? "You came back." : "Click."}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
