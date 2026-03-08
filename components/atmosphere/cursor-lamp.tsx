"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { type MotionValue } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { usePresenceStore } from "@/lib/stores/presence-store"

interface CursorLampProps {
  smoothX: MotionValue<number>
  smoothY: MotionValue<number>
  lampRadius?: number
}

export function CursorLamp({ smoothX, smoothY, lampRadius = 520 }: CursorLampProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const radiusRef = useRef(lampRadius)
  const [lit, setLit] = useState(false)
  const activeRef = useRef(true)
  const idleOpacityRef = useRef(0.93)
  const cursorPosRef = useRef({ x: 0, y: 0 })

  radiusRef.current = lampRadius

  // Ignite lamp on first click
  const handleIgnite = useCallback(() => {
    if (lit) return
    setLit(true)

    // Flash effect
    const flash = flashRef.current
    if (flash) {
      const { x, y } = cursorPosRef.current
      flash.style.background = `radial-gradient(circle 600px at ${x}px ${y}px, rgba(212,160,84,0.25) 0%, transparent 70%)`
      flash.style.opacity = "1"
      flash.style.transition = "opacity 0.8s ease-out"
      requestAnimationFrame(() => {
        flash.style.opacity = "0"
      })
    }
  }, [lit])

  useEffect(() => {
    window.addEventListener("click", handleIgnite, { once: true })
    return () => window.removeEventListener("click", handleIgnite)
  }, [handleIgnite])

  // Track cursor position for flash placement
  useEffect(() => {
    if (reducedMotion) return

    const unsubX = smoothX.on("change", (x) => {
      const y = smoothY.get()
      cursorPosRef.current = { x, y }
    })

    return () => unsubX()
  }, [smoothX, smoothY, reducedMotion])

  // Render lamp gradient
  useEffect(() => {
    if (reducedMotion) return

    const overlay = overlayRef.current
    if (!overlay) return

    const updateGradient = (x: number, y: number) => {
      const r = radiusRef.current
      if (lit) {
        overlay.style.background = `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent 0%, rgba(10,11,18,0.15) 35%, rgba(10,11,18,0.45) 55%, rgba(10,11,18,${idleOpacityRef.current}) 90%)`
      } else {
        // Before ignition: fully dark
        overlay.style.background = `rgba(10,11,18,0.97)`
      }
    }

    // Initialize
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    updateGradient(cx, cy)

    const unsubX = smoothX.on("change", (x) => {
      const y = smoothY.get()
      if (x === 0 && y === 0) return
      updateGradient(x, y)
    })

    // Idle detection
    const interval = setInterval(() => {
      const store = usePresenceStore.getState()
      const isIdle = !store.isActive || Date.now() - store.lastMoveTime > 3000
      if (isIdle && activeRef.current) {
        activeRef.current = false
        idleOpacityRef.current = 0.95
      } else if (!isIdle && !activeRef.current) {
        activeRef.current = true
        idleOpacityRef.current = 0.93
      }
    }, 500)

    return () => {
      unsubX()
      clearInterval(interval)
    }
  }, [smoothX, smoothY, reducedMotion, lit])

  if (reducedMotion) return null

  return (
    <>
      <div
        ref={overlayRef}
        className="pointer-events-none fixed inset-0 z-[997]"
        style={{ background: "rgba(10,11,18,0.97)" }}
        aria-hidden="true"
      />
      {/* Click flash overlay */}
      <div
        ref={flashRef}
        className="pointer-events-none fixed inset-0 z-[996]"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
    </>
  )
}
