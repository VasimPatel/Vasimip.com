"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { cn } from "@/lib/utils"

interface TreasureRevealProps {
  children: React.ReactNode
  width?: number
  height?: number
  revealThreshold?: number
  onReveal?: () => void
  className?: string
}

export function TreasureReveal({
  children,
  width = 300,
  height = 200,
  revealThreshold = 50,
  onReveal,
  className,
}: TreasureRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const isDrawing = useRef(false)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = width
    canvas.height = height

    // Treasure chest wooden texture
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, "#8B6914")
    gradient.addColorStop(0.3, "#A0801C")
    gradient.addColorStop(0.5, "#C4A035")
    gradient.addColorStop(0.7, "#A0801C")
    gradient.addColorStop(1, "#6B5210")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // Metal bands
    ctx.fillStyle = "#7C7C7C"
    ctx.fillRect(0, height * 0.45, width, 8)
    ctx.fillRect(0, 0, width, 6)
    ctx.fillRect(0, height - 6, width, 6)

    // Lock
    ctx.beginPath()
    ctx.arc(width / 2, height * 0.48, 12, 0, Math.PI * 2)
    ctx.fillStyle = "#D4AF37"
    ctx.fill()
    ctx.strokeStyle = "#8B6914"
    ctx.lineWidth = 2
    ctx.stroke()

    // Keyhole
    ctx.beginPath()
    ctx.arc(width / 2, height * 0.46, 4, 0, Math.PI * 2)
    ctx.fillStyle = "#1a1a2e"
    ctx.fill()
    ctx.fillRect(width / 2 - 2, height * 0.47, 4, 8)

    // Scratch instruction
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
    ctx.font = "bold 14px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("🔑 Scratch to unlock! 🔑", width / 2, height * 0.2)
  }, [width, height])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const scratch = (x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(x, y, 22, 0, Math.PI * 2)
    ctx.fill()

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let transparent = 0
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++
    }
    const percent = (transparent / (imageData.data.length / 4)) * 100
    if (percent > revealThreshold && !isRevealed) {
      setIsRevealed(true)
      onReveal?.()
    }
  }

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isRevealed) return
    isDrawing.current = true
    const { x, y } = getPos(e)
    scratch(x, y)
  }

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || isRevealed) return
    e.preventDefault()
    const { x, y } = getPos(e)
    scratch(x, y)
  }

  const handleEnd = () => {
    isDrawing.current = false
  }

  return (
    <div className={cn("relative inline-block", className)} style={{ width, height }}>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {children}
      </div>

      {!isRevealed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          aria-label="Scratch to reveal hidden treasure"
          role="img"
        />
      )}
    </div>
  )
}
