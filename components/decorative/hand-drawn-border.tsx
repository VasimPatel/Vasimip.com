import { cn } from "@/lib/utils"

interface HandDrawnBorderProps {
  className?: string
  children: React.ReactNode
}

export function HandDrawnBorder({ className, children }: HandDrawnBorderProps) {
  return (
    <div
      className={cn("relative", className)}
      style={{ filter: "url(#hand-drawn)" }}
    >
      {children}
    </div>
  )
}
