"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { DialogueChoice } from "@/lib/data/dialogue-scripts"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface DialogueChoicesProps {
  choices: DialogueChoice[]
  onChoose: (choiceId: string, nextNodeId: string) => void
  className?: string
}

export function DialogueChoices({ choices, onChoose, className }: DialogueChoicesProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div className={cn("flex flex-col gap-2 mt-4", className)}>
      {choices.map((choice, i) => (
        <motion.button
          key={choice.id}
          onClick={() => onChoose(choice.id, choice.nextNodeId)}
          className="w-full text-left px-4 py-3 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)] hover:bg-[var(--comic-yellow)] hover:text-[var(--comic-panel-border)] transition-colors font-handwriting text-lg text-[var(--comic-ink)]"
          style={{ boxShadow: "2px 2px 0 var(--comic-panel-shadow)" }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          transition={{ delay: reducedMotion ? 0 : i * 0.1, duration: reducedMotion ? 0.15 : 0.3 }}
          whileHover={reducedMotion ? {} : { x: 4 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="font-pixel text-[8px] mr-2 opacity-60">
            {String.fromCharCode(65 + i)}.
          </span>
          {choice.label}
        </motion.button>
      ))}
    </div>
  )
}
