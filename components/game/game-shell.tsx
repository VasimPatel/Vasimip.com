"use client"

import { useCallback, useEffect, useRef } from "react"
import { ComicViewport } from "@/components/game/comic-viewport"
import { SvgComicFilters } from "@/components/game/svg-comic-filters"
import { SceneTransition } from "@/components/game/scene-transition"
import { GameHUD } from "@/components/game/hud/game-hud"
import { ZoneNav } from "@/components/game/zone-nav"
import { useZoneNavigation } from "@/hooks/use-zone-navigation"
import { useGameStore } from "@/lib/stores/game-store"
import { useXP } from "@/hooks/use-xp"
import { useAchievements } from "@/hooks/use-achievements"
import { ZONES } from "@/lib/data/zones"

import { TitleScreen } from "@/components/zones/title-screen"
import { OriginStory } from "@/components/zones/origin-story"
import { QuestBoard } from "@/components/zones/quest-board"
import { TheArchives } from "@/components/zones/the-archives"
import { TrainingGrounds } from "@/components/zones/training-grounds"
import { MessengersGuild } from "@/components/zones/messengers-guild"

const ZONE_COMPONENTS = [
  TitleScreen,
  OriginStory,
  QuestBoard,
  TheArchives,
  TrainingGrounds,
  MessengersGuild,
]

export function GameShell() {
  useZoneNavigation()
  const { currentZone, nextZone, prevZone, visitedZones } = useGameStore()
  const { awardXP } = useXP()
  const { discoverAchievement, isDiscovered } = useAchievements()
  const prevZoneRef = useRef(currentZone)

  // Award XP when visiting a new zone (not the title screen)
  useEffect(() => {
    if (currentZone !== prevZoneRef.current && currentZone > 0) {
      const isNewVisit = !visitedZones.includes(currentZone) || visitedZones.length <= 2
      if (isNewVisit) {
        awardXP("visitZone")
      }

      // Check world-explorer achievement
      const allZonesVisited = ZONES.every((z) => visitedZones.includes(z.index))
      if (allZonesVisited && !isDiscovered("world-explorer")) {
        discoverAchievement("world-explorer")
      }
    }
    prevZoneRef.current = currentZone
  }, [currentZone, visitedZones, awardXP, discoverAchievement, isDiscovered])

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (direction === "left") nextZone()
      else prevZone()
    },
    [nextZone, prevZone]
  )

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    ;(e.currentTarget as HTMLElement).dataset.touchStartX = String(touch.clientX)
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = Number((e.currentTarget as HTMLElement).dataset.touchStartX)
      const endX = e.changedTouches[0].clientX
      const diff = endX - startX
      if (Math.abs(diff) > 50) {
        handleSwipe(diff < 0 ? "left" : "right")
      }
    },
    [handleSwipe]
  )

  const CurrentZoneComponent = ZONE_COMPONENTS[currentZone]

  return (
    <ComicViewport>
      <SvgComicFilters />
      <GameHUD />

      <div
        className="relative min-h-screen w-full pb-20"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="region"
        aria-label="Comic Book RPG Portfolio"
        aria-roledescription="game"
      >
        <SceneTransition zoneKey={currentZone}>
          <CurrentZoneComponent />
        </SceneTransition>
      </div>

      <ZoneNav />
    </ComicViewport>
  )
}
