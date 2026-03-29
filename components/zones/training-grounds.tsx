"use client"

import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { NarratorBox } from "@/components/comic/narrator-box"
import { CharacterSheet } from "@/components/rpg/character-sheet"
import { SkillTree } from "@/components/rpg/skill-tree"
import { QuestLog } from "@/components/rpg/quest-log"
import { BossEncounter } from "@/components/rpg/boss-encounter"
import { DungeonPuzzle } from "@/components/interactive/dungeon-puzzle"
import { PhysicsPanel } from "@/components/panels/physics-panel"
import { BreakablePanel } from "@/components/panels/breakable-panel"
import { InkReveal } from "@/components/ink/ink-reveal"
import { SecretMarker } from "@/components/discovery/secret-marker"
import { StoryFragment } from "@/components/discovery/story-fragment"
import { useXP } from "@/hooks/use-xp"
import { useDiscovery } from "@/hooks/use-discovery"
import { useGameStore } from "@/lib/stores/game-store"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

export function TrainingGrounds() {
  const { awardXP } = useXP()
  const { discoverSecret } = useDiscovery()
  const { addToInventory, completeZone } = useGameStore()

  const handlePuzzleWin = () => {
    discoverSecret("training-combo")
    awardXP("winMiniGame")
    addToInventory("artifact-warrior")
    addToInventory("scroll-training")
    completeZone("training")
  }

  return (
    <ComicPanelPage zoneColor="#F77F00">
      <div className="flex flex-col gap-6 pt-4 pb-12">
        <NarratorBox position="top-left">
          Chapter 4: Training Grounds
        </NarratorBox>

        <InkReveal direction="left">
          <h2 className="font-comic text-4xl sm:text-5xl text-[var(--comic-ink)]">
            TRAINING GROUNDS
          </h2>
          <p className="font-handwriting text-lg text-[var(--comic-ink)] opacity-80 mt-2">
            Review your stats, explore your skill tree, and challenge the dungeon guardian.
          </p>
        </InkReveal>

        {/* Character sheet */}
        <InkReveal direction="center" delay={0.05}>
          <PhysicsPanel tiltStrength={0.3}>
            <CharacterSheet />
          </PhysicsPanel>
        </InkReveal>

        {/* Hidden Stat secret */}
        <SecretMarker
          secretId="training-hidden-stat"
          trigger="click"
          revealContent={
            <StoryFragment
              title="Hidden Stat"
              text="A stat appears that wasn't on the character sheet: LUCK — 99. Sometimes you just have to show up and be ready."
            />
          }
        >
          <div className="font-pixel text-[7px] text-[var(--comic-ink)] opacity-15 text-right mr-4 cursor-pointer">
            LCK: ???
          </div>
        </SecretMarker>

        {/* Tabs: Skills | Quest Log — in physics panel */}
        <InkReveal direction="right" delay={0.1}>
          <PhysicsPanel className="p-4 sm:p-6" tiltStrength={0.2}>
            <Tabs defaultValue="skills" className="w-full">
              <TabsList className="w-full flex border-2 border-[var(--comic-panel-border)] bg-[var(--comic-bg)] p-0 h-auto">
                <TabsTrigger
                  value="skills"
                  className="flex-1 font-pixel text-[8px] py-2.5 data-[state=active]:bg-[var(--comic-yellow)] data-[state=active]:text-[var(--comic-panel-border)] rounded-none border-r border-[var(--comic-panel-border)] last:border-r-0"
                >
                  SKILL TREE
                </TabsTrigger>
                <TabsTrigger
                  value="quests"
                  className="flex-1 font-pixel text-[8px] py-2.5 data-[state=active]:bg-[var(--comic-yellow)] data-[state=active]:text-[var(--comic-panel-border)] rounded-none border-r border-[var(--comic-panel-border)] last:border-r-0"
                >
                  QUEST LOG
                </TabsTrigger>
              </TabsList>

              <TabsContent value="skills" className="mt-4">
                <SkillTree />
              </TabsContent>

              <TabsContent value="quests" className="mt-4">
                <QuestLog />
              </TabsContent>
            </Tabs>
          </PhysicsPanel>
        </InkReveal>

        {/* Weak Wall — breakable panel hiding a trophy case */}
        <InkReveal direction="bottom" delay={0.1}>
          <BreakablePanel
            onBreak={() => discoverSecret("training-weak-wall")}
            hiddenContent={
              <StoryFragment
                title="Weak Wall"
                text="Behind the crumbling wall: a trophy case of failures. Every bug fixed, every deadline missed, every pivot — each one a lesson earned."
              />
            }
          >
            <div className="p-4 text-center">
              <span className="font-comic text-lg text-[var(--comic-ink)] opacity-60">
                This wall looks fragile...
              </span>
              <div className="font-pixel text-[7px] text-[var(--comic-ink)] opacity-30 mt-2">
                RAPID CLICK TO BREAK
              </div>
            </div>
          </BreakablePanel>
        </InkReveal>

        {/* Boss encounter */}
        <InkReveal direction="center" delay={0.15}>
          <PhysicsPanel className="p-6" tiltStrength={0.4}>
            <BossEncounter
              bossName="The Logic Guardian"
              bossEmoji="🐉"
              onVictory={handlePuzzleWin}
            >
              <DungeonPuzzle onWin={handlePuzzleWin} />
            </BossEncounter>
          </PhysicsPanel>
        </InkReveal>
      </div>
    </ComicPanelPage>
  )
}
