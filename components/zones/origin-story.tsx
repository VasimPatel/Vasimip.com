"use client"

import { useEffect, useRef } from "react"
import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { ComicPanel } from "@/components/comic/comic-panel"
import { PanelGrid } from "@/components/comic/panel-grid"
import { SpeechBubble } from "@/components/comic/speech-bubble"
import { NarratorBox } from "@/components/comic/narrator-box"
import { DialogueBox } from "@/components/rpg/dialogue-box"
import { DialogueChoices } from "@/components/rpg/dialogue-choices"
import { LootDrop } from "@/components/rpg/loot-drop"
import { LoreEntry } from "@/components/interactive/lore-entry"
import { ComicEmphasis } from "@/components/interactive/comic-emphasis"
import { useDialogue } from "@/hooks/use-dialogue"
import { useXP } from "@/hooks/use-xp"
import { useAchievements } from "@/hooks/use-achievements"
import { useGameStore } from "@/lib/stores/game-store"

export function OriginStory() {
  const { currentLine, hasChoices, isComplete, isLastLine, advance, makeChoice, currentNode } =
    useDialogue("origin-intro")
  const { awardXP } = useXP()
  const { discoverAchievement } = useAchievements()
  const { addToInventory, completedZones, completeZone, visitedZones } = useGameStore()
  const xpAwarded = useRef(false)

  // Award XP for visiting this zone for the first time
  useEffect(() => {
    if (!xpAwarded.current && !completedZones.includes("origin")) {
      xpAwarded.current = true
    }
  }, [completedZones])

  const handleDialogueChoice = (choiceId: string, nextNodeId: string) => {
    makeChoice(choiceId, nextNodeId)
    awardXP("dialogueChoice")
  }

  const handleLootReveal = () => {
    discoverAchievement("sticky-secret")
    addToInventory("scroll-origin")
    completeZone("origin")
  }

  return (
    <ComicPanelPage zoneColor="#E63946">
      <div className="flex flex-col gap-6 pt-4 pb-12">
        {/* Zone title */}
        <NarratorBox position="top-left">
          Chapter 1: Origin Story
        </NarratorBox>

        {/* Dialogue system */}
        <div className="max-w-2xl">
          <DialogueBox
            line={currentLine}
            onAdvance={advance}
            showContinue={!hasChoices && !isComplete}
          />
          {hasChoices && currentNode?.choices && (
            <DialogueChoices
              choices={currentNode.choices}
              onChoose={handleDialogueChoice}
            />
          )}
        </div>

        {/* Multi-panel comic layout */}
        {(isComplete || !currentLine) && (
          <PanelGrid layout="story">
            {/* Panel 1 — wide intro */}
            <ComicPanel className="p-6" delay={0.1}>
              <SpeechBubble variant="speech" tail="left" delay={0.3}>
                <p className="text-base">
                  I&apos;m <ComicEmphasis>Vasim</ComicEmphasis> — a full-stack software engineer who
                  believes code should be an <ComicEmphasis color="var(--comic-red)">adventure</ComicEmphasis>.
                </p>
              </SpeechBubble>

              <div className="mt-4 text-sm text-[var(--comic-ink)] leading-relaxed">
                <p>
                  I craft interactive web experiences with React, TypeScript, and an obsession for
                  detail. When I&apos;m not building UIs, I&apos;m probably sketching ideas, playing
                  video games, or exploring new tech.
                </p>
              </div>
            </ComicPanel>

            {/* Panel 2 — Skills discovery */}
            <ComicPanel className="p-4" delay={0.3}>
              <h3 className="font-comic text-xl text-[var(--comic-ink)] mb-3">SKILLS DISCOVERED</h3>
              <div className="flex flex-col gap-2">
                <LoreEntry title="Frontend Mastery" icon="⚔️">
                  React, Next.js, TypeScript, Tailwind CSS, Framer Motion — these are my primary weapons
                  in the quest to build beautiful, performant interfaces.
                </LoreEntry>
                <LoreEntry title="Backend Knowledge" icon="🛡️">
                  Node.js, Python, SQL, REST, GraphQL — the tools I wield behind the scenes to power
                  the experiences I create.
                </LoreEntry>
                <LoreEntry title="Tools of the Trade" icon="🔧">
                  Git, Figma, Testing frameworks, CI/CD pipelines — the utilities that keep the
                  quest running smoothly.
                </LoreEntry>
              </div>
            </ComicPanel>
          </PanelGrid>
        )}

        {/* Panel 3 — Philosophy */}
        {(isComplete || !currentLine) && (
          <ComicPanel className="p-6" delay={0.5}>
            <SpeechBubble variant="thought" tail="right" delay={0.6}>
              <p className="text-sm">
                I believe the best software feels like <em>magic</em> — invisible complexity
                that creates <ComicEmphasis color="var(--comic-blue)">delightful</ComicEmphasis> experiences.
              </p>
            </SpeechBubble>
          </ComicPanel>
        )}

        {/* Panel 4 — Currently training */}
        {(isComplete || !currentLine) && (
          <ComicPanel variant="splash" className="p-6" delay={0.7}>
            <NarratorBox position="top-left" delay={0.8}>
              Training montage...
            </NarratorBox>
            <div className="mt-6">
              <h3 className="font-comic text-2xl text-[var(--comic-ink)] mb-2">CURRENTLY LEVELING UP</h3>
              <div className="flex flex-wrap gap-2 mt-3">
                {["AI/ML", "System Design", "Rust", "WebGL"].map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1.5 border-2 border-[var(--comic-panel-border)] font-pixel text-[8px] text-[var(--comic-ink)] bg-[var(--comic-bg)]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </ComicPanel>
        )}

        {/* Loot Drop */}
        {(isComplete || !currentLine) && (
          <LootDrop label="Fun Fact Loot Drop!" onReveal={handleLootReveal}>
            <div className="text-center">
              <p className="font-comic text-lg text-[var(--comic-ink)] mb-2">
                🎮 FUN FACT
              </p>
              <p className="font-handwriting text-base text-[var(--comic-ink)]">
                This entire portfolio is also a playable game — you&apos;re earning XP right now
                just by exploring! Check the HUD at the top.
              </p>
              <p className="font-pixel text-[8px] text-[var(--comic-green)] mt-2">
                +75 XP &bull; Scroll of Origin acquired!
              </p>
            </div>
          </LootDrop>
        )}
      </div>
    </ComicPanelPage>
  )
}
