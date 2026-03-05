"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { DialogueLine } from "@/lib/data/dialogue-scripts"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface DialogueBoxProps {
  line: DialogueLine | null
  onAdvance: () => void
  showContinue?: boolean
  className?: string
}

const speakerColors: Record<string, string> = {
  narrator: "var(--comic-yellow)",
  character: "var(--comic-blue)",
  system: "var(--comic-green)",
}

export function DialogueBox({ line, onAdvance, showContinue = true, className }: DialogueBoxProps) {
  const reducedMotion = useReducedMotion()

  if (!line) return null

  const color = speakerColors[line.speakerType || "character"]

  return (
    <motion.div
      className={cn(
        "relative w-full border-3 border-[var(--comic-panel-border)] bg-[var(--comic-panel)] p-4",
        "shadow-[3px_3px_0_var(--comic-panel-shadow)]",
        className
      )}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0.15 : 0.3 }}
      key={line.text}
    >
      {/* Speaker name */}
      <div
        className="absolute -top-3 left-4 px-3 py-0.5 border-2 border-[var(--comic-panel-border)] font-pixel text-[8px] text-[var(--comic-panel-border)]"
        style={{ backgroundColor: color }}
      >
        {line.speaker}
      </div>

      {/* Text */}
      <p className="font-handwriting text-xl text-[var(--comic-ink)] mt-2 leading-relaxed">
        {line.text}
      </p>

      {/* Continue indicator */}
      {showContinue && (
        <button
          onClick={onAdvance}
          className="mt-3 font-pixel text-[8px] text-[var(--comic-ink)] opacity-50 hover:opacity-100 transition-opacity"
        >
          ▼ CONTINUE
        </button>
      )}
    </motion.div>
  )
}
