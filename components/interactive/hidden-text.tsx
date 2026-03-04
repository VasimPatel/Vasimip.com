"use client"

import { cn } from "@/lib/utils"

interface HiddenTextProps {
  children: React.ReactNode
  className?: string
}

export function HiddenText({ children, className }: HiddenTextProps) {
  return (
    <span
      className={cn(
        "text-transparent selection:text-[var(--notebook-ink)] selection:bg-yellow-200/50 transition-colors",
        className
      )}
      aria-label="Hidden text - select to reveal"
    >
      {children}
    </span>
  )
}
