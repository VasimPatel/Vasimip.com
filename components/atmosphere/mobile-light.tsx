"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function MobileLight() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [tapLight, setTapLight] = useState<{ x: number; y: number } | null>(null)
  const reducedMotion = useReducedMotion()

  // Centered ambient light for mobile
  useEffect(() => {
    if (reducedMotion) return
    const overlay = overlayRef.current
    if (!overlay) return

    const update = () => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      overlay.style.background = `radial-gradient(circle 500px at ${cx}px ${cy}px, transparent 0%, rgba(10,11,18,0.5) 50%, rgba(10,11,18,0.85) 80%, rgba(10,11,18,0.95) 100%)`
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [reducedMotion])

  // Tap creates temporary secondary light
  const handleTap = useCallback((e: TouchEvent) => {
    if (reducedMotion) return
    const touch = e.touches[0]
    if (!touch) return
    setTapLight({ x: touch.clientX, y: touch.clientY })
    setTimeout(() => setTapLight(null), 2000)
  }, [reducedMotion])

  useEffect(() => {
    window.addEventListener("touchstart", handleTap)
    return () => window.removeEventListener("touchstart", handleTap)
  }, [handleTap])

  if (reducedMotion) return null

  return (
    <>
      <div
        ref={overlayRef}
        className="pointer-events-none fixed inset-0 z-[997]"
        style={{
          background: `radial-gradient(circle 500px at 50vw 50vh, transparent 0%, rgba(10,11,18,0.5) 50%, rgba(10,11,18,0.85) 80%, rgba(10,11,18,0.95) 100%)`,
        }}
        aria-hidden="true"
      />
      {tapLight && (
        <div
          className="pointer-events-none fixed inset-0 z-[996]"
          style={{
            background: `radial-gradient(circle 150px at ${tapLight.x}px ${tapLight.y}px, rgba(212,160,84,0.15) 0%, transparent 100%)`,
            animation: "fade-out 2s ease-out forwards",
          }}
          aria-hidden="true"
        />
      )}
    </>
  )
}
