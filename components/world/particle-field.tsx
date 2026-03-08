"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ParticleFieldProps {
  count?: number
  className?: string
  color?: string
}

export function ParticleField({ count = 20, className, color }: ParticleFieldProps) {
  const reducedMotion = useReducedMotion()

  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: 1 + Math.random() * 2,
        duration: 4 + Math.random() * 6,
        delay: Math.random() * 5,
      })),
    [count]
  )

  if (reducedMotion) return null

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: color || "var(--comic-ink)",
            opacity: 0.15,
            animation: `float ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
