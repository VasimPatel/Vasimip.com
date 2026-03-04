"use client"

import { cn } from "@/lib/utils"

interface HighlighterTextProps {
  children: React.ReactNode
  color?: string
  className?: string
}

export function HighlighterText({
  children,
  color = "rgba(255, 255, 0, 0.3)",
  className,
}: HighlighterTextProps) {
  return (
    <span
      className={cn(
        "relative cursor-default transition-all duration-300 ease-out",
        "hover:[background-size:100%_100%] [background-size:0%_100%]",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(${color}, ${color})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left bottom",
        transition: "background-size 0.4s ease-out",
      }}
    >
      {children}
    </span>
  )
}
