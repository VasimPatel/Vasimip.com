"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface SpeechBubbleProps {
  children: React.ReactNode
  variant?: "speech" | "thought" | "shout" | "whisper"
  tail?: "left" | "right" | "bottom" | "none"
  className?: string
  delay?: number
}

export function SpeechBubble({
  children,
  variant = "speech",
  tail = "left",
  className,
  delay = 0,
}: SpeechBubbleProps) {
  const reducedMotion = useReducedMotion()

  const variantStyles = {
    speech: "rounded-2xl border-3 border-[var(--comic-panel-border)] bg-white dark:bg-[#1a1a2e]",
    thought: "rounded-[50%] border-3 border-[var(--comic-panel-border)] border-dashed bg-white dark:bg-[#1a1a2e]",
    shout: "rounded-none border-4 border-[var(--comic-panel-border)] bg-[var(--comic-yellow)] skew-x-[-2deg]",
    whisper: "rounded-2xl border-2 border-dashed border-[var(--comic-ink-light)] bg-white/80 dark:bg-[#1a1a2e]/80 italic",
  }

  const tailElements: Record<string, React.ReactNode> = {
    left: (
      <div className="absolute -bottom-3 left-6 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[14px] border-t-[var(--comic-panel-border)]" aria-hidden="true">
        <div className="absolute -top-[16px] left-[-10px] w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[12px] border-t-white dark:border-t-[#1a1a2e]" />
      </div>
    ),
    right: (
      <div className="absolute -bottom-3 right-6 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[14px] border-t-[var(--comic-panel-border)]" aria-hidden="true">
        <div className="absolute -top-[16px] left-[-10px] w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[12px] border-t-white dark:border-t-[#1a1a2e]" />
      </div>
    ),
    bottom: (
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[16px] border-t-[var(--comic-panel-border)]" aria-hidden="true">
        <div className="absolute -top-[18px] left-[-10px] w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-white dark:border-t-[#1a1a2e]" />
      </div>
    ),
    none: null,
  }

  return (
    <motion.div
      className={cn("relative px-5 py-3 text-[var(--comic-ink)]", variantStyles[variant], className)}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{
        duration: reducedMotion ? 0.15 : 0.4,
        delay: reducedMotion ? 0 : delay,
        type: "spring",
        stiffness: 300,
        damping: 20,
      }}
    >
      {children}
      {variant !== "thought" && tailElements[tail]}
      {variant === "thought" && tail !== "none" && (
        <div className={cn("absolute -bottom-6", tail === "left" ? "left-8" : "right-8")} aria-hidden="true">
          <div className="w-3 h-3 rounded-full border-2 border-[var(--comic-panel-border)] bg-white dark:bg-[#1a1a2e]" />
          <div className="w-2 h-2 rounded-full border-2 border-[var(--comic-panel-border)] bg-white dark:bg-[#1a1a2e] ml-2 mt-1" />
        </div>
      )}
    </motion.div>
  )
}
