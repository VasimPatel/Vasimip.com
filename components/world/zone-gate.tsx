"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"
import { SpeedLines } from "@/components/comic/speed-lines"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ZoneGateProps {
  title: string
  subtitle?: string
  color: string
  icon?: string
  className?: string
}

export function ZoneGate({ title, subtitle, color, icon, className }: ZoneGateProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const textScale = useTransform(scrollYProgress, [0.3, 0.5, 0.7], [0.8, 1.1, 0.8])
  const textOpacity = useTransform(scrollYProgress, [0.2, 0.4, 0.6, 0.8], [0, 1, 1, 0])
  const bgOpacity = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0, 0.15, 0])

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center justify-center min-h-[50vh] overflow-hidden",
        className
      )}
    >
      {/* Color wash background */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundColor: color,
          opacity: reducedMotion ? 0.1 : bgOpacity,
        }}
      />

      {/* Speed lines */}
      {!reducedMotion && (
        <SpeedLines variant="focus" lineCount={16} color={color} className="opacity-20" />
      )}

      {/* Gate content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-3 text-center px-4"
        style={
          reducedMotion
            ? {}
            : { scale: textScale, opacity: textOpacity }
        }
      >
        {icon && <span className="text-5xl">{icon}</span>}
        <h2
          className="font-comic text-5xl sm:text-7xl comic-text-outline"
          style={{ color }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="font-pixel text-[10px] text-[var(--comic-ink)] opacity-60 tracking-wider">
            {subtitle}
          </p>
        )}
      </motion.div>

      {/* Rip/tear line at bottom */}
      <svg
        className="absolute bottom-0 left-0 right-0 w-full h-8"
        viewBox="0 0 1000 32"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,0 L50,16 L100,4 L150,20 L200,8 L250,24 L300,4 L350,18 L400,6 L450,22 L500,2 L550,20 L600,8 L650,24 L700,4 L750,16 L800,10 L850,22 L900,6 L950,18 L1000,0 L1000,32 L0,32 Z"
          fill="var(--comic-bg)"
        />
      </svg>
    </div>
  )
}
