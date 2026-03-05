"use client"

import { motion } from "framer-motion"
import { useGameStore } from "@/lib/stores/game-store"
import { SpeedLines } from "@/components/comic/speed-lines"
import { TypingText } from "@/components/interactive/typing-text"
import { NarratorBox } from "@/components/comic/narrator-box"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function TitleScreen() {
  const { hasStartedQuest, startQuest, setZone } = useGameStore()
  const reducedMotion = useReducedMotion()

  const handleBeginQuest = () => {
    startQuest()
    setZone(1)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      {/* Speed lines background */}
      <SpeedLines variant="radial" lineCount={24} />

      {/* Title */}
      <motion.h1
        className="font-comic text-6xl sm:text-8xl md:text-9xl text-center comic-text-outline relative z-10"
        style={{ color: "var(--comic-yellow)" }}
        initial={reducedMotion ? { opacity: 0 } : { scale: 0, rotate: -10 }}
        animate={reducedMotion ? { opacity: 1 } : { scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
      >
        VASIM PATEL
      </motion.h1>

      {/* Subtitle with typing effect */}
      <motion.div
        className="relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <p className="font-pixel text-xs sm:text-sm text-[var(--comic-ink)] tracking-wide text-center">
          <TypingText
            text="A Comic Book RPG Portfolio"
            speed={60}
            delay={1000}
          />
        </p>
      </motion.div>

      {/* Begin Quest button */}
      <motion.button
        onClick={handleBeginQuest}
        className="relative z-10 font-pixel text-sm sm:text-base px-8 py-4 border-3 border-[var(--comic-panel-border)] bg-[var(--comic-yellow)] text-[var(--comic-panel-border)] hover:scale-105 transition-transform glow-pulse"
        style={{ boxShadow: "4px 4px 0 var(--comic-panel-shadow)" }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.5 }}
        whileHover={reducedMotion ? {} : { scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {hasStartedQuest ? "CONTINUE QUEST" : "BEGIN QUEST"}
      </motion.button>

      {/* Returning player narrator box */}
      {hasStartedQuest && (
        <NarratorBox position="center" delay={2.2} className="relative z-10">
          Meanwhile... the adventurer returns.
        </NarratorBox>
      )}

      {/* Keyboard hint */}
      <motion.p
        className="relative z-10 font-pixel text-[7px] text-[var(--comic-ink)] opacity-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 2.5 }}
      >
        USE ARROW KEYS OR SWIPE TO NAVIGATE
      </motion.p>
    </div>
  )
}
