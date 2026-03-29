"use client"

import { useEffect, useCallback } from "react"
import { type MotionValue } from "framer-motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { useTorchStore } from "@/lib/stores/torch-store"
import { TorchOverlay } from "./torch-overlay"
import { TorchFlame } from "./torch-flame"

interface TorchCursorProps {
  smoothX: MotionValue<number>
  smoothY: MotionValue<number>
  cursorX: MotionValue<number>
  cursorY: MotionValue<number>
  speed: MotionValue<number>
  velocityX: MotionValue<number>
  velocityY: MotionValue<number>
  lampRadius?: number
}

export function TorchCursor({
  smoothX,
  smoothY,
  cursorX,
  cursorY,
  velocityX,
  velocityY,
  lampRadius,
}: TorchCursorProps) {
  const reducedMotion = useReducedMotion()
  const ignite = useTorchStore((s) => s.ignite)

  const handleClick = useCallback(() => {
    ignite()
  }, [ignite])

  useEffect(() => {
    window.addEventListener("click", handleClick, { once: true })
    window.addEventListener("touchstart", handleClick, { once: true })
    return () => {
      window.removeEventListener("click", handleClick)
      window.removeEventListener("touchstart", handleClick)
    }
  }, [handleClick])

  if (reducedMotion) return null

  return (
    <>
      <TorchOverlay
        smoothX={smoothX}
        smoothY={smoothY}
        lampRadius={lampRadius}
      />
      <TorchFlame
        cursorX={cursorX}
        cursorY={cursorY}
        velocityX={velocityX}
        velocityY={velocityY}
      />
    </>
  )
}
