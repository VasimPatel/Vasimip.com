"use client"

import { cn } from "@/lib/utils"

interface ComicViewportProps {
  children: React.ReactNode
  className?: string
}

export function ComicViewport({ children, className }: ComicViewportProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen w-full overflow-hidden",
        "bg-[var(--comic-bg)]",
        className
      )}
    >
      {/* Halftone background pattern */}
      <div
        className="pointer-events-none absolute inset-0 comic-halftone opacity-50"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">
        {children}
      </div>
    </div>
  )
}
