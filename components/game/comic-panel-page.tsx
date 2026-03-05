"use client"

import { cn } from "@/lib/utils"

interface ComicPanelPageProps {
  children: React.ReactNode
  className?: string
  zoneColor?: string
}

export function ComicPanelPage({ children, className, zoneColor }: ComicPanelPageProps) {
  return (
    <div
      className={cn(
        "relative w-full min-h-screen",
        "px-4 py-20 sm:px-8 md:px-12 lg:px-16",
        "overflow-y-auto comic-scroll",
        className
      )}
    >
      {/* Zone accent stripe at top */}
      {zoneColor && (
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: zoneColor }}
          aria-hidden="true"
        />
      )}

      <div className="mx-auto max-w-5xl">
        {children}
      </div>
    </div>
  )
}
