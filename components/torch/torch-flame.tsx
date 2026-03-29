"use client"

import { useRef, useEffect, useState } from "react"
import { motion, type MotionValue, useTransform } from "framer-motion"
import { useTorchStore } from "@/lib/stores/torch-store"

interface TorchFlameProps {
  cursorX: MotionValue<number>
  cursorY: MotionValue<number>
  velocityX: MotionValue<number>
  velocityY: MotionValue<number>
}

export function TorchFlame({ cursorX, cursorY, velocityX, velocityY }: TorchFlameProps) {
  const isLit = useTorchStore((s) => s.isLit)
  const [flickerScale, setFlickerScale] = useState(1)
  const rafRef = useRef<number>(0)

  // Tilt opposite to movement direction (subtle, a few degrees)
  const rotate = useTransform(velocityX, [-500, 0, 500], [6, 0, -6])

  // Slight vertical stretch when moving up
  const scaleY = useTransform(velocityY, [-500, 0, 500], [1.15, 1, 0.9])

  // Flicker animation synced with overlay
  useEffect(() => {
    if (!isLit) return

    let running = true
    const loop = () => {
      if (!running) return
      const t = performance.now() / 1000
      const flicker =
        1 +
        Math.sin(t * 2.3) * 0.015 +
        Math.sin(t * 3.7) * 0.01 +
        Math.sin(t * 5.1) * 0.008
      setFlickerScale(flicker)
      rafRef.current = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isLit])

  if (!isLit) return null

  return (
    <motion.div
      className="pointer-events-none fixed z-[1000]"
      style={{
        x: cursorX,
        y: cursorY,
        rotate,
        scaleY,
        translateX: "-50%",
        translateY: "-50%",
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      aria-hidden="true"
    >
      {/* Outer glow */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 6 * flickerScale,
          height: 10 * flickerScale,
          boxShadow: [
            `0 0 20px 8px rgba(212, 160, 84, ${0.4 * flickerScale})`,
            `0 0 45px 15px rgba(212, 160, 84, ${0.15 * flickerScale})`,
            `0 0 80px 30px rgba(184, 120, 64, ${0.06 * flickerScale})`,
          ].join(", "),
        }}
      />
      {/* Flame body */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 8 * flickerScale,
          height: 14 * flickerScale,
          background: "radial-gradient(ellipse, #f0c060 0%, rgba(212, 160, 84, 0.6) 60%, transparent 100%)",
          filter: "blur(2px)",
        }}
      />
      {/* Hot core */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 4 * flickerScale,
          height: 6 * flickerScale,
          background: "radial-gradient(ellipse, #fff8e0 0%, rgba(240, 192, 96, 0.8) 50%, transparent 100%)",
          filter: "blur(1px)",
        }}
      />
    </motion.div>
  )
}
