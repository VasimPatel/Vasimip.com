"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { ActionText } from "@/components/comic/action-text"
import { SpeedLines } from "@/components/comic/speed-lines"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface BossEncounterProps {
  bossName: string
  bossEmoji?: string
  children: React.ReactNode // The challenge component (e.g. dungeon puzzle)
  onVictory?: () => void
  className?: string
}

export function BossEncounter({
  bossName,
  bossEmoji = "🐉",
  children,
  onVictory,
  className,
}: BossEncounterProps) {
  const [phase, setPhase] = useState<"intro" | "battle" | "victory">("intro")
  const reducedMotion = useReducedMotion()

  const startBattle = () => setPhase("battle")

  const handleVictory = () => {
    setPhase("victory")
    onVictory?.()
  }

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            className="flex flex-col items-center gap-6 py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SpeedLines variant="focus" />
            <span className="text-7xl">{bossEmoji}</span>
            <h3 className="font-comic text-3xl text-[var(--comic-red)] comic-text-outline">
              {bossName}
            </h3>
            <p className="font-handwriting text-lg text-[var(--comic-ink)] text-center">
              A challenger approaches! Defeat them to prove your worth.
            </p>
            <button
              onClick={startBattle}
              className="font-pixel text-sm px-6 py-3 border-3 border-[var(--comic-panel-border)] bg-[var(--comic-red)] text-white hover:scale-105 transition-transform"
              style={{ boxShadow: "3px 3px 0 var(--comic-panel-shadow)" }}
            >
              ACCEPT CHALLENGE
            </button>
          </motion.div>
        )}

        {phase === "battle" && (
          <motion.div
            key="battle"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="font-pixel text-[10px] text-[var(--comic-red)]">
                ⚔️ BATTLE IN PROGRESS ⚔️
              </div>
              <div onClick={() => {/* Container for puzzle */}}>
                {/* Pass onVictory to children via clone or context */}
                <div>
                  {typeof children === "function"
                    ? (children as (props: { onWin: () => void }) => React.ReactNode)({ onWin: handleVictory })
                    : children}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "victory" && (
          <motion.div
            key="victory"
            className="flex flex-col items-center gap-6 py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <ActionText text="VICTORY!" color="var(--comic-yellow)" size="lg" />
            <p className="font-handwriting text-xl text-[var(--comic-ink)]">
              The {bossName} has been defeated!
            </p>
            <p className="font-pixel text-[10px] text-[var(--comic-green)]">
              +100 XP &bull; Warrior Badge earned!
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
