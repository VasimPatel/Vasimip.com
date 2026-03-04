import { cn } from "@/lib/utils"

interface RuledLinesProps {
  lineHeight?: number
  topMargin?: number
  className?: string
}

export function RuledLines({ lineHeight = 32, topMargin = 60, className }: RuledLinesProps) {
  return (
    <svg className={cn("absolute inset-0 w-full h-full pointer-events-none", className)} aria-hidden="true">
      <defs>
        <pattern
          id="ruled-lines"
          x="0"
          y={topMargin}
          width="100%"
          height={lineHeight}
          patternUnits="userSpaceOnUse"
        >
          <line
            x1="0"
            y1="0"
            x2="100%"
            y2="0"
            className="stroke-[var(--notebook-lines)]"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ruled-lines)" />
    </svg>
  )
}
