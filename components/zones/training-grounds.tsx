"use client"

import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { NarratorBox } from "@/components/comic/narrator-box"
import { ComicPanel } from "@/components/comic/comic-panel"
import { CharacterSheet } from "@/components/rpg/character-sheet"
import { SkillTree } from "@/components/rpg/skill-tree"
import { QuestLog } from "@/components/rpg/quest-log"
import { BossEncounter } from "@/components/rpg/boss-encounter"
import { DungeonPuzzle } from "@/components/interactive/dungeon-puzzle"
import { useXP } from "@/hooks/use-xp"
import { useAchievements } from "@/hooks/use-achievements"
import { useGameStore } from "@/lib/stores/game-store"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

export function TrainingGrounds() {
  const { awardXP } = useXP()
  const { discoverAchievement } = useAchievements()
  const { addToInventory, completeZone } = useGameStore()

  const handlePuzzleWin = () => {
    discoverAchievement("dungeon-warrior")
    awardXP("winMiniGame")
    addToInventory("artifact-warrior")
    addToInventory("scroll-training")
    completeZone("training")
  }

  return (
    <ComicPanelPage zoneColor="#F77F00">
      <div className="flex flex-col gap-6 pt-4 pb-12">
        {/* Zone title */}
        <NarratorBox position="top-left">
          Chapter 4: Training Grounds
        </NarratorBox>

        <h2 className="font-comic text-4xl sm:text-5xl text-[var(--comic-ink)]">
          TRAINING GROUNDS
        </h2>
        <p className="font-handwriting text-lg text-[var(--comic-ink)] opacity-80">
          Review your stats, explore your skill tree, and challenge the dungeon guardian.
        </p>

        {/* Character sheet */}
        <CharacterSheet />

        {/* Tabs: Stats | Skill Tree | Quest Log */}
        <ComicPanel className="p-4 sm:p-6" delay={0.2}>
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
        </ComicPanel>

        {/* Boss encounter */}
        <ComicPanel className="p-6" delay={0.4}>
          <BossEncounter
            bossName="The Logic Guardian"
            bossEmoji="🐉"
            onVictory={handlePuzzleWin}
          >
            <DungeonPuzzle onWin={handlePuzzleWin} />
          </BossEncounter>
        </ComicPanel>
      </div>
    </ComicPanelPage>
  )
}
