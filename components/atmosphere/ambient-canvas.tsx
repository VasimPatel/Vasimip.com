"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { usePresenceStore } from "@/lib/stores/presence-store"

interface AmbientParticle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  baseOpacity: number
}

interface AmbientCanvasProps {
  particleDensity?: number
}

const BASE_COUNT = 35
const CURSOR_ATTRACT_RADIUS = 200
const CURSOR_ATTRACT_STRENGTH = 0.15

export function AmbientCanvas({ particleDensity = 0.3 }: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<AmbientParticle[]>([])
  const animFrameRef = useRef<number>(0)
  const reducedMotion = useReducedMotion()
  const densityRef = useRef(particleDensity)
  densityRef.current = particleDensity

  useEffect(() => {
    if (reducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener("resize", resize)

    // Initialize particles
    const count = Math.round(BASE_COUNT * densityRef.current)
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3 * dpr,
      vy: -(0.1 + Math.random() * 0.4) * dpr,
      radius: (0.5 + Math.random() * 1.5) * dpr,
      opacity: 0.15 + Math.random() * 0.35,
      baseOpacity: 0.15 + Math.random() * 0.35,
    }))

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const store = usePresenceStore.getState()
      const cx = store.cursorX * dpr
      const cy = store.cursorY * dpr
      const isActive = store.isActive

      // Adjust particle count dynamically
      const targetCount = Math.round(BASE_COUNT * densityRef.current)
      while (particlesRef.current.length < targetCount) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: canvas.height + 10 * dpr,
          vx: (Math.random() - 0.5) * 0.3 * dpr,
          vy: -(0.1 + Math.random() * 0.4) * dpr,
          radius: (0.5 + Math.random() * 1.5) * dpr,
          opacity: 0,
          baseOpacity: 0.15 + Math.random() * 0.35,
        })
      }
      if (particlesRef.current.length > targetCount) {
        particlesRef.current.length = targetCount
      }

      for (const p of particlesRef.current) {
        // Cursor attraction
        if (isActive) {
          const dx = cx - p.x
          const dy = cy - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CURSOR_ATTRACT_RADIUS * dpr && dist > 0) {
            const force = (1 - dist / (CURSOR_ATTRACT_RADIUS * dpr)) * CURSOR_ATTRACT_STRENGTH
            p.vx += (dx / dist) * force * dpr
            p.vy += (dy / dist) * force * dpr
          }
        }

        // Apply velocity
        p.x += p.vx
        p.y += p.vy

        // Damping
        p.vx *= 0.995
        p.vy *= 0.995

        // Reset base drift upward
        p.vy += -(0.01) * dpr

        // Fade in/out based on position
        p.opacity += (p.baseOpacity - p.opacity) * 0.02

        // Wrap around
        if (p.y < -10 * dpr) {
          p.y = canvas.height + 10 * dpr
          p.x = Math.random() * canvas.width
          p.opacity = 0
        }
        if (p.x < -10 * dpr) p.x = canvas.width + 10 * dpr
        if (p.x > canvas.width + 10 * dpr) p.x = -10 * dpr

        // Draw ember mote
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212, 160, 84, ${p.opacity})`
        ctx.fill()
      }

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener("resize", resize)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[1]"
      aria-hidden="true"
    />
  )
}
