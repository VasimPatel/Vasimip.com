"use client"

import { cn } from "@/lib/utils"

interface HalftonePatternProps {
  className?: string
  dotSize?: number
  spacing?: number
  opacity?: number
}

export function HalftonePattern({
  className,
  dotSize = 1,
  spacing = 8,
  opacity = 0.5,
}: HalftonePatternProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        backgroundImage: `radial-gradient(circle, var(--comic-halftone) ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
        opacity,
      }}
      aria-hidden="true"
    />
  )
}
