"use client"

import { motion } from "framer-motion"
import { useGameStore } from "@/lib/stores/game-store"
import { SpeedLines } from "@/components/comic/speed-lines"
import { TypingText } from "@/components/interactive/typing-text"
import { NarratorBox } from "@/components/comic/narrator-box"
import { SecretMarker } from "@/components/discovery/secret-marker"
import { StoryFragment } from "@/components/discovery/story-fragment"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function TitleScreen() {
  const { hasStartedQuest, startQuest } = useGameStore()
  const reducedMotion = useReducedMotion()

  const handleBeginQuest = () => {
    startQuest()
    const origin = document.getElementById("origin")
    if (origin) {
      origin.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
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

      {/* Hidden signature secret — bottom right corner */}
      <SecretMarker
        secretId="hidden-signature"
        trigger="click"
        className="absolute bottom-8 right-8 z-10"
        revealContent={
          <StoryFragment
            title="Creator's Mark"
            text="Scratched into the corner of the title card, barely visible: a tiny signature. Every great work begins with someone deciding to leave their mark on the world."
          />
        }
      >
        <div className="font-pixel text-[6px] text-[var(--comic-ink)] opacity-10 hover:opacity-30 transition-opacity cursor-pointer select-none">
          VP
        </div>
      </SecretMarker>

      {/* Keyboard hint */}
      <motion.p
        className="relative z-10 font-pixel text-[7px] text-[var(--comic-ink)] opacity-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 2.5 }}
      >
        SCROLL DOWN TO EXPLORE
      </motion.p>
    </div>
  )
}
