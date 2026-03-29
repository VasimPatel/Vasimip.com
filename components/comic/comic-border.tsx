"use client"

import { cn } from "@/lib/utils"

interface ComicBorderProps {
  children: React.ReactNode
  className?: string
  thickness?: number
  wobble?: boolean
}

export function ComicBorder({
  children,
  className,
  thickness = 3,
  wobble = false,
}: ComicBorderProps) {
  return (
    <div
      className={cn("relative", className)}
      style={{
        border: `${thickness}px solid var(--comic-panel-border)`,
        boxShadow: `${thickness + 1}px ${thickness + 1}px 0 var(--comic-panel-shadow)`,
        filter: wobble ? "url(#hand-drawn)" : undefined,
      }}
    >
      {children}
    </div>
  )
}
