"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface StatBarProps {
  label: string
  value: number // 0-100
  color?: string
  className?: string
  delay?: number
}

export function StatBar({ label, value, color = "var(--comic-green)", className, delay = 0 }: StatBarProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="font-pixel text-[8px] text-[var(--comic-ink)] w-16 text-right uppercase">
        {label}
      </span>
      <div className="relative flex-1 h-4 overflow-hidden rounded-sm border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 flex items-center justify-end pr-2">
          <span className="font-pixel text-[7px] text-[var(--comic-ink)] mix-blend-difference">
            {value}
          </span>
        </div>
      </div>
    </div>
  )
}
