"use client"

import { useEffect, useRef, useCallback } from "react"
import { type MotionValue } from "framer-motion"
import { useTorchStore } from "@/lib/stores/torch-store"
import { usePresenceStore } from "@/lib/stores/presence-store"

interface TorchOverlayProps {
  smoothX: MotionValue<number>
  smoothY: MotionValue<number>
  lampRadius?: number
}

// Void color
const VOID_R = 10
const VOID_G = 11
const VOID_B = 18

// Inverse-square falloff: alpha(r) = 1 / (1 + (r / halfRadius)^2)
function inverseSquareAlpha(r: number, halfRadius: number): number {
  const ratio = r / halfRadius
  return 1 / (1 + ratio * ratio)
}

export function TorchOverlay({ smoothX, smoothY, lampRadius = 400 }: TorchOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const posRef = useRef({ x: 0, y: 0 })
  const isLit = useTorchStore((s) => s.isLit)
  const ignitedAt = useTorchStore((s) => s.ignitedAt)
  const isLitRef = useRef(isLit)
  const ignitedAtRef = useRef(ignitedAt)

  isLitRef.current = isLit
  ignitedAtRef.current = ignitedAt

  // Resize canvas to match viewport
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
  }, [])

  // Main render loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.width
    const h = canvas.height

    // Clear
    ctx.clearRect(0, 0, w, h)

    if (!isLitRef.current) {
      // Pre-ignition: solid dark overlay
      ctx.fillStyle = `rgba(${VOID_R},${VOID_G},${VOID_B},0.97)`
      ctx.fillRect(0, 0, w, h)
      return
    }

    const now = performance.now()
    const timeSinceIgnition = ignitedAtRef.current ? now - ignitedAtRef.current : 10000

    // Ignition animation: radius starts at 2x and eases to 1x over 600ms
    const ignitionProgress = Math.min(timeSinceIgnition / 600, 1)
    const eased = 1 - Math.pow(1 - ignitionProgress, 3) // ease-out cubic
    const ignitionMultiplier = 2 - eased // 2 -> 1

    // Flicker: slow, subtle multi-frequency sine for organic variation
    const t = now / 1000
    const flicker =
      Math.sin(t * 2.3) * 0.01 +
      Math.sin(t * 3.7) * 0.008 +
      Math.sin(t * 5.1) * 0.005

    // Speed-based response
    const store = usePresenceStore.getState()
    const speed = store.cursorSpeed || 0
    const speedStretch = 1 + Math.min(speed / 800, 0.15)

    // Final half-radius — reduced to keep light tight
    const baseHalfRadius = lampRadius * 0.19
    const halfRadius = baseHalfRadius * ignitionMultiplier * speedStretch * (1 + flicker) * dpr

    // Cursor position in device pixels
    const cx = posRef.current.x * dpr
    const cy = posRef.current.y * dpr

    // Base darkness alpha (slightly brighter during ignition flash)
    const baseAlpha = 0.97 - (1 - ignitionProgress) * 0.03

    // Step 1: Fill with darkness
    ctx.globalCompositeOperation = "source-over"
    ctx.fillStyle = `rgba(${VOID_R},${VOID_G},${VOID_B},${baseAlpha})`
    ctx.fillRect(0, 0, w, h)

    // Step 2: Carve out the light cone using destination-out
    ctx.globalCompositeOperation = "destination-out"

    // Create radial gradient with inverse-square falloff
    const maxRadius = halfRadius * 3.5
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius)

    // Generate ~20 stops following inverse-square law
    const numStops = 20
    for (let i = 0; i <= numStops; i++) {
      const t = i / numStops
      const r = t * maxRadius
      const alpha = inverseSquareAlpha(r, halfRadius)
      // Scale: subtle erasure of darkness
      const eraseAlpha = alpha * 0.255
      gradient.addColorStop(t, `rgba(0,0,0,${eraseAlpha})`)
    }

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    // Step 3: Add warm color tint into the carved area
    ctx.globalCompositeOperation = "source-atop"

    // Warm amber tint — stronger near center, fading outward
    const warmGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfRadius * 2)
    warmGradient.addColorStop(0, "rgba(255, 248, 224, 0.014)")   // warm white core
    warmGradient.addColorStop(0.15, "rgba(240, 192, 96, 0.009)") // bright amber
    warmGradient.addColorStop(0.4, "rgba(212, 160, 84, 0.005)")  // ember
    warmGradient.addColorStop(1, "rgba(184, 120, 64, 0)")        // fade to nothing

    ctx.fillStyle = warmGradient
    ctx.fillRect(0, 0, w, h)

    // Reset composite operation
    ctx.globalCompositeOperation = "source-over"
  }, [lampRadius])

  // Animation loop
  useEffect(() => {
    handleResize()
    window.addEventListener("resize", handleResize)

    let running = true

    const loop = () => {
      if (!running) return
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }

    // Initial draw
    draw()

    // Start loop when lit, or keep drawing for ignition
    const unsubLit = useTorchStore.subscribe((state) => {
      if (state.isLit && running) {
        loop()
      }
    })

    // If already lit on mount, start loop
    if (useTorchStore.getState().isLit) {
      loop()
    }

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", handleResize)
      unsubLit()
    }
  }, [handleResize, draw])

  // Track cursor position from spring-smoothed MotionValues
  useEffect(() => {
    const unsubX = smoothX.on("change", (x) => {
      posRef.current.x = x
      posRef.current.y = smoothY.get()

      // If not lit, still need to redraw (stay dark) but don't start loop
      if (!isLitRef.current) {
        draw()
      }
    })

    return () => unsubX()
  }, [smoothX, smoothY, draw])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[997]"
      aria-hidden="true"
    />
  )
}
