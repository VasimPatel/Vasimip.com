"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Map } from "lucide-react"
import { cn } from "@/lib/utils"
import { useGameStore } from "@/lib/stores/game-store"
import { ZONES } from "@/lib/data/zones"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function ZoneNav() {
  const { currentZone, setZone, hasStartedQuest, visitedZones } = useGameStore()
  const [mapOpen, setMapOpen] = useState(false)
  const reducedMotion = useReducedMotion()

  if (!hasStartedQuest) return null

  // Skip title screen in nav
  const navZones = ZONES.slice(1)

  return (
    <>
      {/* Bottom nav bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-3xl px-3 pb-3">
          <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--hud-bg)] backdrop-blur-sm border-2 border-[var(--hud-border)] shadow-lg">
            {/* Zone buttons */}
            {navZones.map((zone) => {
              const isActive = currentZone === zone.index
              const isVisited = visitedZones.includes(zone.index)
              return (
                <button
                  key={zone.id}
                  onClick={() => setZone(zone.index)}
                  className={cn(
                    "relative flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg transition-colors",
                    isActive
                      ? "bg-[var(--comic-panel)]"
                      : "hover:bg-[var(--comic-halftone)]"
                  )}
                  aria-label={`Go to ${zone.title}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="text-base">{zone.icon}</span>
                  <span className={cn(
                    "font-pixel text-[6px] leading-tight text-center truncate max-w-full",
                    isActive ? "text-[var(--comic-ink)]" : "text-[var(--comic-ink)] opacity-50"
                  )}>
                    {zone.subtitle}
                  </span>
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                      style={{ backgroundColor: zone.color }}
                      layoutId="zone-nav-indicator"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  {/* Unvisited dot */}
                  {!isVisited && !isActive && (
                    <div className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-[var(--comic-red)]" />
                  )}
                </button>
              )
            })}

            {/* Map toggle */}
            <button
              onClick={() => setMapOpen(!mapOpen)}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--comic-panel-border)] bg-[var(--comic-panel)] hover:scale-105 transition-transform"
              aria-label="Toggle zone map"
            >
              <Map className="w-4 h-4 text-[var(--comic-ink)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Zone map overlay */}
      <AnimatePresence>
        {mapOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[55] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMapOpen(false)}
            />
            <motion.div
              className="fixed inset-x-4 bottom-20 z-[56] max-w-lg mx-auto p-6 rounded-lg border-3 border-[var(--comic-panel-border)] bg-[var(--comic-bg)] shadow-2xl"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            >
              <h3 className="font-comic text-2xl text-[var(--comic-ink)] mb-4">ZONE MAP</h3>
              <div className="flex flex-col gap-2">
                {ZONES.map((zone) => {
                  const isActive = currentZone === zone.index
                  const isVisited = visitedZones.includes(zone.index)
                  return (
                    <button
                      key={zone.id}
                      onClick={() => {
                        setZone(zone.index)
                        setMapOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 border-2 border-[var(--comic-panel-border)] transition-colors text-left",
                        isActive
                          ? "bg-[var(--comic-yellow)] text-[var(--comic-panel-border)]"
                          : "bg-[var(--comic-panel)] hover:bg-[var(--comic-halftone)]"
                      )}
                    >
                      <span className="text-xl">{zone.icon}</span>
                      <div className="flex-1">
                        <div className="font-comic text-base">{zone.title}</div>
                        <div className="font-pixel text-[7px] opacity-60">{zone.subtitle}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isVisited && <span className="text-xs text-[var(--comic-green)]">✓</span>}
                        {isActive && <span className="font-pixel text-[7px]">HERE</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
