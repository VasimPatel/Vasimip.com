"use client"

import { useState, useCallback } from "react"

export function useScreenEffects() {
  const [shaking, setShaking] = useState(false)
  const [flashing, setFlashing] = useState(false)

  const triggerShake = useCallback(() => {
    setShaking(true)
    setTimeout(() => setShaking(false), 400)
  }, [])

  const triggerFlash = useCallback(() => {
    setFlashing(true)
    setTimeout(() => setFlashing(false), 300)
  }, [])

  return { shaking, flashing, triggerShake, triggerFlash }
}
