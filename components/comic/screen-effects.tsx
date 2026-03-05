"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ScreenShakeProps {
  trigger: boolean
  children: React.ReactNode
}

export function ScreenShake({ trigger, children }: ScreenShakeProps) {
  return (
    <div className={trigger ? "screen-shake" : ""}>
      {children}
    </div>
  )
}

interface ScreenFlashProps {
  trigger: boolean
  color?: string
  duration?: number
}

export function ScreenFlash({ trigger, color = "#ffffff", duration = 300 }: ScreenFlashProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (trigger) {
      setShow(true)
      const timer = setTimeout(() => setShow(false), duration)
      return () => clearTimeout(timer)
    }
  }, [trigger, duration])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[100]"
          style={{ backgroundColor: color }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration / 1000 }}
        />
      )}
    </AnimatePresence>
  )
}

interface VignetteProps {
  intensity?: number
}

export function Vignette({ intensity = 0.3 }: VignetteProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90]"
      style={{
        background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${intensity}) 100%)`,
      }}
      aria-hidden="true"
    />
  )
}
