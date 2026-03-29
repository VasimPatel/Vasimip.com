"use client"

import { useEffect, useState } from "react"
import { usePresence } from "@/hooks/use-presence"
import { usePresenceStore } from "@/lib/stores/presence-store"
<<<<<<< Updated upstream
import { InkTrail } from "./ink-trail"
import { InkCursor } from "./ink-cursor"
import { InkSplash } from "./ink-splash"
import { CursorLamp } from "@/components/atmosphere/cursor-lamp"
=======
import { useTorchStore } from "@/lib/stores/torch-store"
import { InkTrail } from "./ink-trail"
import { InkSplash } from "./ink-splash"
import { TorchCursor } from "@/components/torch/torch-cursor"
>>>>>>> Stashed changes
import { MobileLight } from "@/components/atmosphere/mobile-light"
import { AmbientCanvas } from "@/components/atmosphere/ambient-canvas"

interface InkLayerProps {
  lampRadius?: number
  particleDensity?: number
}

export function InkLayer({ lampRadius = 300, particleDensity = 0.3 }: InkLayerProps) {
<<<<<<< Updated upstream
  const { cursorX, cursorY, smoothX, smoothY, speed } = usePresence()
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const setMobile = usePresenceStore((s) => s.setMobile)
=======
  const { cursorX, cursorY, smoothX, smoothY, speed, velocityX, velocityY } = usePresence()
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const setMobile = usePresenceStore((s) => s.setMobile)
  const isLit = useTorchStore((s) => s.isLit)
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
          <CursorLamp smoothX={smoothX} smoothY={smoothY} lampRadius={lampRadius} />
          <InkTrail cursorX={cursorX} cursorY={cursorY} speed={speed} />
          <InkCursor cursorX={cursorX} cursorY={cursorY} speed={speed} />
        </>
      )}
      <InkSplash />
=======
          <TorchCursor
            smoothX={smoothX}
            smoothY={smoothY}
            cursorX={cursorX}
            cursorY={cursorY}
            speed={speed}
            velocityX={velocityX}
            velocityY={velocityY}
            lampRadius={lampRadius}
          />
          {isLit && <InkTrail cursorX={cursorX} cursorY={cursorY} speed={speed} />}
        </>
      )}
      {isLit && <InkSplash />}
>>>>>>> Stashed changes
    </>
  )
}
