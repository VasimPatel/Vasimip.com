"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ClickableCheckboxProps {
  label: string
  defaultChecked?: boolean
  className?: string
}

export function ClickableCheckbox({ label, defaultChecked = false, className }: ClickableCheckboxProps) {
  const [checked, setChecked] = useState(defaultChecked)

  return (
    <button
      onClick={() => setChecked(!checked)}
      className={cn(
        "flex items-center gap-2 font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] cursor-pointer group",
        checked && "line-through opacity-60",
        className
      )}
    >
      <span className="relative w-4 h-4 border border-[var(--notebook-ink)] rounded-sm flex-shrink-0">
        {checked && (
          <motion.svg
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            viewBox="0 0 16 16"
            className="absolute inset-0 w-full h-full"
          >
            <motion.path
              d="M3 8l3 3 7-7"
              fill="none"
              stroke="var(--notebook-ink)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3 }}
            />
          </motion.svg>
        )}
      </span>
      {label}
    </button>
  )
}
