"use client"

import { useRef } from "react"
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion"
import { cn } from "@/lib/utils"
import { useProximity } from "@/hooks/use-proximity"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface PhysicsPanelProps {
  children: React.ReactNode
  className?: string
  draggable?: boolean
  tiltStrength?: number
  liftStrength?: number
  delay?: number
}

export function PhysicsPanel({
  children,
  className,
  draggable = false,
  tiltStrength = 0.3,
  liftStrength = 0.3,
  delay = 0,
}: PhysicsPanelProps) {
  const reducedMotion = useReducedMotion()
  const constraintsRef = useRef<HTMLDivElement>(null)
  const { ref, proximity, offsetX, offsetY, handleMouseMove, handleMouseLeave } = useProximity(300)

  // Subtle tilt — max 1.5 degrees
  const rotateX = useTransform(offsetY, [-1, 1], [1.5 * tiltStrength, -1.5 * tiltStrength])
  const rotateY = useTransform(offsetX, [-1, 1], [-1.5 * tiltStrength, 1.5 * tiltStrength])
  const scale = useTransform(proximity, [0, 1], [1, 1 + 0.01 * liftStrength])

  // Border opacity brightens on proximity
  const borderOpacity = useTransform(proximity, [0, 1], [0.2, 0.6])

  const springRotateX = useSpring(rotateX, { stiffness: 200, damping: 20 })
  const springRotateY = useSpring(rotateY, { stiffness: 200, damping: 20 })
  const springScale = useSpring(scale, { stiffness: 200, damping: 20 })

  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)

  if (reducedMotion) {
    return (
      <motion.div
        className={cn(
          "relative",
          className
        )}
        style={{
          border: "1px solid rgba(212, 160, 84, 0.2)",
        }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.15, delay }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div ref={constraintsRef} className="relative">
      <motion.div
        ref={ref}
        className={cn(
          "relative",
          draggable && "cursor-grab active:cursor-grabbing",
          className
        )}
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          scale: springScale,
          x: dragX,
          y: dragY,
          border: useTransform(
            borderOpacity,
            (o) => `1px solid rgba(212, 160, 84, ${o})`
          ),
          boxShadow: useTransform(
            proximity,
            [0, 1],
            ["0 0 0 transparent", "0 0 20px rgba(212, 160, 84, 0.1)"]
          ),
          transformPerspective: 800,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        drag={draggable}
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 20 }}
        whileDrag={{ scale: 1.02, cursor: "grabbing", zIndex: 50 }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{
          duration: 0.6,
          delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
