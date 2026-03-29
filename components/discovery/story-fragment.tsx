"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface StoryFragmentProps {
  title: string
  text: string
  className?: string
}

export function StoryFragment({ title, text, className }: StoryFragmentProps) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      className={cn(
        "relative p-4 border-2 border-dashed border-[var(--comic-yellow)] bg-[var(--comic-panel)] rounded",
        className
      )}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Decorative corner marks */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[var(--comic-yellow)] -translate-x-px -translate-y-px" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[var(--comic-yellow)] translate-x-px -translate-y-px" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[var(--comic-yellow)] -translate-x-px translate-y-px" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[var(--comic-yellow)] translate-x-px translate-y-px" />

      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">✦</span>
        <h4 className="font-comic text-sm text-[var(--comic-yellow)]">{title}</h4>
      </div>
      <p className="font-caveat text-base text-[var(--comic-ink)] leading-relaxed italic">
        {text}
      </p>
    </motion.div>
  )
}
