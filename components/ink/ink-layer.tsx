"use client"

import { useEffect, useState } from "react"
import { usePresence } from "@/hooks/use-presence"
import { usePresenceStore } from "@/lib/stores/presence-store"
import { InkTrail } from "./ink-trail"
import { InkCursor } from "./ink-cursor"
import { InkSplash } from "./ink-splash"
import { CursorLamp } from "@/components/atmosphere/cursor-lamp"
import { MobileLight } from "@/components/atmosphere/mobile-light"
import { AmbientCanvas } from "@/components/atmosphere/ambient-canvas"

interface InkLayerProps {
  lampRadius?: number
  particleDensity?: number
}

export function InkLayer({ lampRadius = 300, particleDensity = 0.3 }: InkLayerProps) {
  const { cursorX, cursorY, smoothX, smoothY, speed } = usePresence()
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const setMobile = usePresenceStore((s) => s.setMobile)

  useEffect(() => {
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0
    setIsTouchDevice(touch)
    setMobile(touch)
  }, [setMobile])

  return (
    <>
      <AmbientCanvas particleDensity={isTouchDevice ? particleDensity * 0.5 : particleDensity} />
      {isTouchDevice ? (
        <MobileLight />
      ) : (
        <>
          <CursorLamp smoothX={smoothX} smoothY={smoothY} lampRadius={lampRadius} />
          <InkTrail cursorX={cursorX} cursorY={cursorY} speed={speed} />
          <InkCursor cursorX={cursorX} cursorY={cursorY} speed={speed} />
        </>
      )}
      <InkSplash />
    </>
  )
}
