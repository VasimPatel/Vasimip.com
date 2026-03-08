"use client"

import { useEffect, useRef } from "react"
import { ComicViewport } from "@/components/game/comic-viewport"
import { SvgComicFilters } from "@/components/game/svg-comic-filters"
import { GameHUD } from "@/components/game/hud/game-hud"
import { ZoneNav } from "@/components/game/zone-nav"
import { InkLayer } from "@/components/ink/ink-layer"
import { DiscoveryJournal } from "@/components/discovery/discovery-journal"
import { WorldScroll } from "@/components/world/world-scroll"
import { ZoneSection } from "@/components/world/zone-section"
import { ZoneGate } from "@/components/world/zone-gate"
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
  const { currentZone, visitedZones } = useGameStore()
  const { awardXP } = useXP()
  const { discoverAchievement, isDiscovered } = useAchievements()
  const prevZoneRef = useRef(currentZone)

  // Award XP when visiting a new zone (not the title screen)
  useEffect(() => {
    if (currentZone !== prevZoneRef.current && currentZone > 0) {
      if (!visitedZones.includes(currentZone)) {
        awardXP("visitZone")
      }

      const allZonesVisited = ZONES.every((z) => visitedZones.includes(z.index))
      if (allZonesVisited && !isDiscovered("world-explorer")) {
        discoverAchievement("world-explorer")
      }
    }
    prevZoneRef.current = currentZone
  }, [currentZone, visitedZones, awardXP, discoverAchievement, isDiscovered])

  // Sync URL hash to current zone
  useEffect(() => {
    const hash = ZONES[currentZone]?.hash
    if (hash && window.location.hash !== hash) {
      window.history.replaceState(null, "", hash)
    }
  }, [currentZone])

  return (
    <ComicViewport>
      <SvgComicFilters />
      <InkLayer />
      <GameHUD />

      <WorldScroll>
        <div
          className="cursor-none-desktop"
          role="region"
          aria-label="Comic Book RPG Portfolio"
          aria-roledescription="game"
        >
          {ZONE_COMPONENTS.map((ZoneComponent, i) => {
            const zone = ZONES[i]
            const nextZone = ZONES[i + 1]

            return (
              <div key={zone.id}>
                <ZoneSection
                  passageIndex={zone.index}
                  passageId={zone.id}
                  minHeight={i === 0 ? "100vh" : "auto"}
                >
                  <ZoneComponent />
                </ZoneSection>

                {/* Zone gate between zones */}
                {nextZone && (
                  <ZoneGate
                    title={nextZone.title}
                    subtitle={nextZone.subtitle}
                    color={nextZone.color}
                    icon={nextZone.icon}
                  />
                )}
              </div>
            )
          })}

          {/* Bottom spacer */}
          <div className="h-32" />
        </div>
      </WorldScroll>

      <ZoneNav />
      <DiscoveryJournal />
    </ComicViewport>
  )
}
