"use client"

import { cn } from "@/lib/utils"

interface SpeedLinesProps {
  variant?: "radial" | "linear" | "focus"
  className?: string
  lineCount?: number
  color?: string
}

export function SpeedLines({
  variant = "radial",
  className,
  lineCount = 24,
  color,
}: SpeedLinesProps) {
  if (variant === "radial") {
    return (
      <div
        className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-[200%] w-[1.5px] origin-center"
            style={{
              transform: `rotate(${(360 / lineCount) * i}deg)`,
              background: `linear-gradient(to bottom, transparent 0%, ${color || "var(--comic-halftone)"} 35%, transparent 65%)`,
              animation: `speed-line-pulse ${1.5 + (i % 3) * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
    )
  }

  if (variant === "linear") {
    return (
      <div
        className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 h-[1px] w-full"
            style={{
              top: `${(100 / lineCount) * i}%`,
              background: `linear-gradient(to right, transparent 0%, ${color || "var(--comic-halftone)"} 20%, ${color || "var(--comic-halftone)"} 80%, transparent 100%)`,
              animation: `speed-line-pulse ${1 + (i % 4) * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>
    )
  }

  // Focus variant — converge toward center
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }).map((_, i) => {
        const angle = (360 / lineCount) * i
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-[150%] w-[2px] origin-bottom"
            style={{
              transform: `rotate(${angle}deg) translateY(-50%)`,
              background: `linear-gradient(to top, transparent 0%, ${color || "var(--comic-ink)"} 40%, transparent 60%)`,
              opacity: 0.15,
            }}
          />
        )
      })}
    </div>
  )
}
