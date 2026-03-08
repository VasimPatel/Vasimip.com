"use client"

import { useEffect, useRef, useCallback } from "react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  life: number
  maxLife: number
}

export function InkSplash() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animFrameRef = useRef<number>(0)
  const reducedMotion = useReducedMotion()

  const spawnSplash = useCallback(
    (x: number, y: number) => {
      if (reducedMotion) return

      const dpr = window.devicePixelRatio
      const count = 8 + Math.floor(Math.random() * 4)

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6
        const speed = 40 + Math.random() * 120

        particlesRef.current.push({
          x: x * dpr,
          y: y * dpr,
          vx: Math.cos(angle) * speed * dpr,
          vy: -(Math.abs(Math.sin(angle)) * speed * dpr) - 30 * dpr, // Upward bias
          radius: (1 + Math.random() * 2) * dpr,
          opacity: 0.6 + Math.random() * 0.3,
          life: 0,
          maxLife: 500 + Math.random() * 400,
        })
      }
    },
    [reducedMotion]
  )

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

    const handleClick = (e: MouseEvent) => {
      spawnSplash(e.clientX, e.clientY)
    }
    window.addEventListener("click", handleClick)

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let lastTime = performance.now()

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const alive: Particle[] = []
      for (const p of particlesRef.current) {
        p.life += dt * 1000
        if (p.life > p.maxLife) continue

        const progress = p.life / p.maxLife
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += -80 * dt * dpr // Negative gravity — float upward

        p.vx *= 0.98
        p.vy *= 0.98

        const currentOpacity = p.opacity * (1 - progress)
        const currentRadius = p.radius * (1 - progress * 0.3)

        // Ember colors: bright amber → copper as they cool
        const r = Math.round(240 - progress * 56)
        const g = Math.round(192 - progress * 72)
        const b = Math.round(96 - progress * 32)

        ctx.beginPath()
        ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${currentOpacity})`
        ctx.fill()

        alive.push(p)
      }
      particlesRef.current = alive

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("click", handleClick)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [reducedMotion, spawnSplash])

  if (reducedMotion) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[998]"
      aria-hidden="true"
    />
  )
}
