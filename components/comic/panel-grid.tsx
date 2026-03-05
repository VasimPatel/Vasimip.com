"use client"

import { cn } from "@/lib/utils"

interface PanelGridProps {
  children: React.ReactNode
  layout?: "2x1" | "1x2" | "2x2" | "3-col" | "splash" | "story"
  className?: string
}

const layoutStyles: Record<string, string> = {
  "2x1": "grid grid-cols-1 sm:grid-cols-2 gap-4",
  "1x2": "grid grid-rows-2 gap-4",
  "2x2": "grid grid-cols-1 sm:grid-cols-2 grid-rows-2 gap-4",
  "3-col": "grid grid-cols-1 sm:grid-cols-3 gap-4",
  splash: "grid grid-cols-1 gap-4",
  story: "grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4",
}

export function PanelGrid({ children, layout = "2x1", className }: PanelGridProps) {
  return (
    <div className={cn(layoutStyles[layout], className)}>
      {children}
    </div>
  )
}
