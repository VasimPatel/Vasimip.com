"use client"

import { cn } from "@/lib/utils"
import { RuledLines } from "@/components/decorative/ruled-lines"
import { MarginLine } from "@/components/decorative/margin-line"
import { HolePunches } from "@/components/decorative/hole-punches"
import { PaperTexture } from "@/components/decorative/paper-texture"

interface NotebookPageProps {
  children: React.ReactNode
  className?: string
  showRuledLines?: boolean
  showMargin?: boolean
  showHolePunches?: boolean
}

export function NotebookPage({
  children,
  className,
  showRuledLines = true,
  showMargin = true,
  showHolePunches = true,
}: NotebookPageProps) {
  return (
    <div
      className={cn(
        "relative w-full h-full bg-[var(--notebook-paper)] overflow-hidden",
        className
      )}
    >
      <PaperTexture />
      {showRuledLines && <RuledLines />}
      {showMargin && <MarginLine />}
      {showHolePunches && <HolePunches />}

      {/* Content area */}
      <div className="relative z-10 h-full w-full pl-[80px] pr-6 pt-[60px] pb-6 overflow-y-auto notebook-scroll">
        {children}
      </div>

      {/* Paper edge shadow */}
      <div className="absolute inset-0 pointer-events-none shadow-inner" />
    </div>
  )
}
