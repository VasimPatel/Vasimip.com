"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ThresholdProps {
  text: string
}

export function Threshold({ text }: ThresholdProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })

  const opacity = useTransform(
    scrollYProgress,
    [0.2, 0.4, 0.6, 0.8],
    [0, 1, 1, 0]
  )

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ minHeight: "50vh" }}
    >
      <motion.p
        className="font-display text-xl sm:text-2xl italic tracking-wide"
        style={{
          color: "var(--ember)",
          opacity: reducedMotion ? 0.7 : opacity,
        }}
      >
        {text}
      </motion.p>
    </div>
  )
}
