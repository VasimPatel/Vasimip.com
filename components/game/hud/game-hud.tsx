"use client"

import { useState } from "react"
import { XPBar } from "./xp-bar"
import { MissionToggle } from "./mission-toggle"
import { AchievementTracker } from "./achievement-tracker"
import { InventoryButton } from "./inventory-button"
import { SoundToggle } from "./sound-toggle"
import { InventoryDrawer } from "@/components/game/inventory/inventory-drawer"
import { useGameStore } from "@/lib/stores/game-store"

export function GameHUD() {
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const hasStartedQuest = useGameStore((s) => s.hasStartedQuest)

  if (!hasStartedQuest) return null

  return (
    <>
      {/* Top HUD bar */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 pointer-events-auto">
          {/* Left side — XP */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-b-lg bg-[var(--hud-bg)] backdrop-blur-sm border-2 border-t-0 border-[var(--hud-border)]">
            <XPBar />
          </div>

          {/* Right side — controls */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-b-lg bg-[var(--hud-bg)] backdrop-blur-sm border-2 border-t-0 border-[var(--hud-border)]">
            <AchievementTracker />
            <InventoryButton onClick={() => setInventoryOpen(true)} />
            <MissionToggle />
            <SoundToggle />
          </div>
        </div>
      </div>

      {/* Inventory drawer */}
      <InventoryDrawer open={inventoryOpen} onClose={() => setInventoryOpen(false)} />
    </>
  )
}
