"use client"

import { useMemo } from "react"

interface HandDrawnBorderProps {
  width: number
  height: number
  strokeWidth?: number
  color?: string
  seed?: number
  className?: string
}

function wobble(value: number, amount: number, seed: number): number {
  // Deterministic pseudo-random wobble
  const s = Math.sin(seed * 12.9898 + value * 78.233) * 43758.5453
  return value + (s - Math.floor(s) - 0.5) * amount * 2
}

export function HandDrawnBorder({
  width,
  height,
  strokeWidth = 3,
  color = "var(--comic-panel-border)",
  seed = 1,
  className,
}: HandDrawnBorderProps) {
  const path = useMemo(() => {
    const w = width
    const h = height
    const wobbleAmount = 2
    const steps = 8

    let d = ""

    // Top edge
    d += `M ${wobble(0, wobbleAmount, seed)} ${wobble(0, wobbleAmount, seed + 1)}`
    for (let i = 1; i <= steps; i++) {
      const x = wobble((w / steps) * i, wobbleAmount, seed + i * 2)
      const y = wobble(0, wobbleAmount, seed + i * 3)
      d += ` L ${x} ${y}`
    }

    // Right edge
    for (let i = 1; i <= steps; i++) {
      const x = wobble(w, wobbleAmount, seed + 20 + i * 2)
      const y = wobble((h / steps) * i, wobbleAmount, seed + 20 + i * 3)
      d += ` L ${x} ${y}`
    }

    // Bottom edge
    for (let i = steps - 1; i >= 0; i--) {
      const x = wobble((w / steps) * i, wobbleAmount, seed + 40 + i * 2)
      const y = wobble(h, wobbleAmount, seed + 40 + i * 3)
      d += ` L ${x} ${y}`
    }

    // Left edge
    for (let i = steps - 1; i >= 0; i--) {
      const x = wobble(0, wobbleAmount, seed + 60 + i * 2)
      const y = wobble((h / steps) * i, wobbleAmount, seed + 60 + i * 3)
      d += ` L ${x} ${y}`
    }

    d += " Z"
    return d
  }, [width, height, seed])

  return (
    <svg
      className={className}
      viewBox={`-4 -4 ${width + 8} ${height + 8}`}
      style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)" }}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
