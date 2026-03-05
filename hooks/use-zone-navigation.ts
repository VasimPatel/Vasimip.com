"use client"

import { useEffect } from "react"
import { useGameStore } from "@/lib/stores/game-store"
import { ZONES, ZONE_HASH_MAP } from "@/lib/data/zones"

export function useZoneNavigation() {
  const { currentZone, setZone, nextZone, prevZone } = useGameStore()

  // Sync hash on zone change
  useEffect(() => {
    const hash = ZONES[currentZone].hash
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash)
    }
  }, [currentZone])

  // Read hash on mount
  useEffect(() => {
    const hash = window.location.hash
    if (hash && ZONE_HASH_MAP[hash] !== undefined) {
      setZone(ZONE_HASH_MAP[hash])
    }

    const handleHashChange = () => {
      const newHash = window.location.hash
      if (newHash && ZONE_HASH_MAP[newHash] !== undefined) {
        setZone(ZONE_HASH_MAP[newHash])
      }
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [setZone])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        nextZone()
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        prevZone()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [nextZone, prevZone])

  return { currentZone, setZone, nextZone, prevZone }
}
