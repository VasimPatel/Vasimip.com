"use client"

import { useEffect, useRef } from "react"
import { type MotionValue } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface InkTrailProps {
  cursorX: MotionValue<number>
  cursorY: MotionValue<number>
  speed: MotionValue<number>
}

interface TrailPoint {
  x: number
  y: number
  radius: number
  opacity: number
  birth: number
}

const TRAIL_LIFETIME = 1200
const MAX_POINTS = 60
const MIN_DISTANCE = 6

export function InkTrail({ cursorX, cursorY, speed }: InkTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<TrailPoint[]>([])
  const lastPointRef = useRef({ x: 0, y: 0 })
  const animFrameRef = useRef<number>(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener("resize", resize)

    const unsubX = cursorX.on("change", (x) => {
      const y = cursorY.get()
      const s = speed.get()
      const last = lastPointRef.current

      const dx = x - last.x
      const dy = y - last.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < MIN_DISTANCE) return

      lastPointRef.current = { x, y }

      // Fast = thin bright streaks, slow = warm pools
      const radius = Math.max(1, Math.min(5, 6 - s * 0.012))
      const opacity = Math.min(0.7, 0.3 + s * 0.001)

      pointsRef.current.push({
        x: x * dpr,
        y: y * dpr,
        radius: radius * dpr,
        opacity,
        birth: Date.now(),
      })

      if (pointsRef.current.length > MAX_POINTS) {
        pointsRef.current = pointsRef.current.slice(-MAX_POINTS)
      }
    })

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const render = () => {
      const now = Date.now()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const alive: TrailPoint[] = []
      for (const p of pointsRef.current) {
        const age = now - p.birth
        if (age > TRAIL_LIFETIME) continue

        const lifeProgress = age / TRAIL_LIFETIME
        const currentOpacity = p.opacity * (1 - lifeProgress)
        const currentRadius = p.radius * (1 - lifeProgress * 0.4)

        // Ember color: warm amber that cools as it fades
        const r = Math.round(212 - lifeProgress * 28)
        const g = Math.round(160 - lifeProgress * 40)
        const b = Math.round(84 - lifeProgress * 20)

        ctx.beginPath()
        ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${currentOpacity})`
        ctx.fill()
        alive.push(p)
      }
      pointsRef.current = alive

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      unsubX()
      window.removeEventListener("resize", resize)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [cursorX, cursorY, speed, reducedMotion])

  if (reducedMotion) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[999]"
      aria-hidden="true"
    />
  )
}
