"use client"

import { useRef, useCallback } from "react"
import { useMotionValue, useTransform, type MotionValue } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface ProximityResult {
  ref: React.RefObject<HTMLDivElement | null>
  distance: MotionValue<number>
  /** 0 = far away, 1 = directly on element */
  proximity: MotionValue<number>
  /** Normalized offset from center: -1 to 1 */
  offsetX: MotionValue<number>
  offsetY: MotionValue<number>
  handleMouseMove: (e: React.MouseEvent) => void
  handleMouseLeave: () => void
}

/**
 * Hook that tracks cursor proximity to an element.
 * Returns reactive motion values for distance, proximity, and offset.
 */
export function useProximity(maxDistance: number = 400): ProximityResult {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  const rawDistance = useMotionValue(maxDistance)
  const rawOffsetX = useMotionValue(0)
  const rawOffsetY = useMotionValue(0)

  // proximity: 1 when cursor is on element, 0 when >= maxDistance away
  const proximity = useTransform(rawDistance, [0, maxDistance], [1, 0])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reducedMotion) return
      const el = ref.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const dx = e.clientX - centerX
      const dy = e.clientY - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)

      rawDistance.set(Math.min(dist, maxDistance))
      rawOffsetX.set(Math.max(-1, Math.min(1, dx / (rect.width / 2))))
      rawOffsetY.set(Math.max(-1, Math.min(1, dy / (rect.height / 2))))
    },
    [reducedMotion, maxDistance, rawDistance, rawOffsetX, rawOffsetY]
  )

  const handleMouseLeave = useCallback(() => {
    rawDistance.set(maxDistance)
    rawOffsetX.set(0)
    rawOffsetY.set(0)
  }, [maxDistance, rawDistance, rawOffsetX, rawOffsetY])

  return {
    ref,
    distance: rawDistance,
    proximity,
    offsetX: rawOffsetX,
    offsetY: rawOffsetY,
    handleMouseMove,
    handleMouseLeave,
  }
}
