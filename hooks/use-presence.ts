"use client"

import { useEffect, useRef, useCallback } from "react"
import {
  useMotionValue,
  useVelocity,
  useSpring,
  useTransform,
} from "framer-motion"
import { usePresenceStore } from "@/lib/stores/presence-store"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function usePresence() {
  const reducedMotion = useReducedMotion()

  // Raw motion values — these update without React re-renders
  const cursorX = useMotionValue(0)
  const cursorY = useMotionValue(0)

  // Smooth spring-dampened cursor for UI elements that follow
  const smoothX = useSpring(cursorX, { stiffness: 150, damping: 20, mass: 0.5 })
  const smoothY = useSpring(cursorY, { stiffness: 150, damping: 20, mass: 0.5 })

  // Velocity for speed-dependent effects
  const velocityX = useVelocity(cursorX)
  const velocityY = useVelocity(cursorY)

  // Cursor speed (magnitude of velocity)
  const speed = useTransform([velocityX, velocityY], ([vx, vy]: number[]) =>
    Math.sqrt(vx * vx + vy * vy)
  )

  // Store update ref to throttle zustand updates
  const frameRef = useRef<number>(0)
  const setCursor = usePresenceStore((s) => s.setCursor)
  const setActive = usePresenceStore((s) => s.setActive)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      cursorX.set(e.clientX)
      cursorY.set(e.clientY)

      // Throttle store updates to rAF
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(() => {
          setCursor(e.clientX, e.clientY)
          frameRef.current = 0
        })
      }
    },
    [cursorX, cursorY, setCursor]
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      cursorX.set(touch.clientX)
      cursorY.set(touch.clientY)

      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(() => {
          setCursor(touch.clientX, touch.clientY)
          frameRef.current = 0
        })
      }
    },
    [cursorX, cursorY, setCursor]
  )

  const handleMouseLeave = useCallback(() => {
    setActive(false)
  }, [setActive])

  const handleMouseEnter = useCallback(() => {
    setActive(true)
  }, [setActive])

  useEffect(() => {
    if (reducedMotion) return

    window.addEventListener("mousemove", handleMouseMove, { passive: true })
    window.addEventListener("touchmove", handleTouchMove, { passive: true })
    document.addEventListener("mouseleave", handleMouseLeave)
    document.addEventListener("mouseenter", handleMouseEnter)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("touchmove", handleTouchMove)
      document.removeEventListener("mouseleave", handleMouseLeave)
      document.removeEventListener("mouseenter", handleMouseEnter)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [reducedMotion, handleMouseMove, handleTouchMove, handleMouseLeave, handleMouseEnter])

  // Idle detection — mark inactive after 3 seconds of no movement
  useEffect(() => {
    if (reducedMotion) return

    const interval = setInterval(() => {
      const lastMove = usePresenceStore.getState().lastMoveTime
      if (Date.now() - lastMove > 3000) {
        setActive(false)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [reducedMotion, setActive])

  return {
    cursorX,
    cursorY,
    smoothX,
    smoothY,
    velocityX,
    velocityY,
    speed,
  }
}
