"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { ComicPanel } from "@/components/comic/comic-panel"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface QuestCardProps {
  title: string
  description: string
  difficulty: number // 1-5
  reward: string
  tags: string[]
  onClick?: () => void
  className?: string
  delay?: number
  isSecret?: boolean
}

export function QuestCard({
  title,
  description,
  difficulty,
  reward,
  tags,
  onClick,
  className,
  delay = 0,
  isSecret = false,
}: QuestCardProps) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      className={cn("cursor-pointer", className)}
      whileHover={reducedMotion ? {} : { scale: 1.02, rotate: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{ rotate: `${(Math.random() - 0.5) * 4}deg` }}
    >
      <ComicPanel
        className="p-5 hover:shadow-lg transition-shadow"
        delay={delay}
        variant={isSecret ? "tilted" : "default"}
      >
        {/* Difficulty swords */}
        <div className="flex items-center gap-1 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={cn("text-sm", i < difficulty ? "opacity-100" : "opacity-20")}
            >
              ⚔️
            </span>
          ))}
          <span className="ml-auto font-pixel text-[7px] text-[var(--comic-yellow)]">
            {reward}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-comic text-xl text-[var(--comic-ink)] mb-1">
          {isSecret ? "??? SECRET QUEST ???" : title}
        </h3>

        {/* Description */}
        <p className="text-sm text-[var(--comic-ink)] opacity-80 mb-3">
          {isSecret ? "Scratch to reveal..." : description}
        </p>

        {/* Tags */}
        {!isSecret && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] font-pixel border border-[var(--comic-panel-border)] text-[var(--comic-ink)] bg-[var(--comic-panel)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </ComicPanel>
    </motion.div>
  )
}
