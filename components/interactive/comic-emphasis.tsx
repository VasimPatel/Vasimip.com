"use client"

import { cn } from "@/lib/utils"

interface ComicEmphasisProps {
  children: React.ReactNode
  color?: string
  className?: string
}

export function ComicEmphasis({
  children,
  color = "var(--comic-yellow)",
  className,
}: ComicEmphasisProps) {
  return (
    <span
      className={cn(
        "relative inline-block px-1 font-bold transition-all duration-200",
        "hover:scale-105",
        className
      )}
      style={{
        textShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
        color: "var(--comic-ink)",
      }}
    >
      <span
        className="absolute inset-0 -z-10 rounded-sm opacity-20"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {children}
    </span>
  )
}
