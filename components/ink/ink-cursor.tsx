"use client"

import { motion, type MotionValue, useTransform } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface InkCursorProps {
  cursorX: MotionValue<number>
  cursorY: MotionValue<number>
  speed: MotionValue<number>
}

export function InkCursor({ cursorX, cursorY, speed }: InkCursorProps) {
  const reducedMotion = useReducedMotion()

  const scale = useTransform(speed, [0, 300], [1, 0.8])
  const opacity = useTransform(speed, [0, 10], [0.5, 0.9])

  if (reducedMotion) return null

  return (
    <motion.div
      className="pointer-events-none fixed z-[1000]"
      style={{
        x: cursorX,
        y: cursorY,
        scale,
        opacity,
        translateX: "-50%",
        translateY: "-50%",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: "var(--ember)",
        boxShadow: "0 0 12px 2px rgba(212, 160, 84, 0.4)",
      }}
      aria-hidden="true"
    />
  )
}
