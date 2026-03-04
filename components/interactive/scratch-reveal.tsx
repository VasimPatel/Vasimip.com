"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { cn } from "@/lib/utils"

interface ScratchRevealProps {
  children: React.ReactNode
  width?: number
  height?: number
  revealThreshold?: number
  onReveal?: () => void
  className?: string
}

export function ScratchReveal({
  children,
  width = 300,
  height = 200,
  revealThreshold = 50,
  onReveal,
  className,
}: ScratchRevealProps) {
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

    // Silver scratch-off overlay
    ctx.fillStyle = "#c0c0c0"
    ctx.fillRect(0, 0, width, height)

    // Add "Scratch here!" text
    ctx.fillStyle = "#999"
    ctx.font = "16px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("✨ Scratch here! ✨", width / 2, height / 2)
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
    ctx.arc(x, y, 20, 0, Math.PI * 2)
    ctx.fill()

    // Check reveal percentage
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
      {/* Content underneath */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        {children}
      </div>

      {/* Scratch overlay */}
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
          aria-label="Scratch to reveal hidden content"
          role="img"
        />
      )}
    </div>
  )
}
