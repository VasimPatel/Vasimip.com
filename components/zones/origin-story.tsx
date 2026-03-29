"use client"

import { useEffect, useRef } from "react"
import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { PanelGrid } from "@/components/comic/panel-grid"
import { SpeechBubble } from "@/components/comic/speech-bubble"
import { NarratorBox } from "@/components/comic/narrator-box"
import { DialogueBox } from "@/components/rpg/dialogue-box"
import { DialogueChoices } from "@/components/rpg/dialogue-choices"
import { LoreEntry } from "@/components/interactive/lore-entry"
import { ComicEmphasis } from "@/components/interactive/comic-emphasis"
import { PhysicsPanel } from "@/components/panels/physics-panel"
import { PeelPanel } from "@/components/panels/peel-panel"
import { BreakablePanel } from "@/components/panels/breakable-panel"
import { InkReveal } from "@/components/ink/ink-reveal"
import { SecretMarker } from "@/components/discovery/secret-marker"
import { StoryFragment } from "@/components/discovery/story-fragment"
import { useDialogue } from "@/hooks/use-dialogue"
import { useXP } from "@/hooks/use-xp"
import { useDiscovery } from "@/hooks/use-discovery"
import { useGameStore } from "@/lib/stores/game-store"

export function OriginStory() {
  const { currentLine, hasChoices, isComplete, advance, makeChoice, currentNode } =
    useDialogue("origin-intro")
  const { awardXP } = useXP()
  const { discoverSecret } = useDiscovery()
  const { completedZones, completeZone } = useGameStore()
  const xpAwarded = useRef(false)

  useEffect(() => {
    if (!xpAwarded.current && !completedZones.includes("origin")) {
      xpAwarded.current = true
    }
  }, [completedZones])

  const handleDialogueChoice = (choiceId: string, nextNodeId: string) => {
    makeChoice(choiceId, nextNodeId)
    awardXP("dialogueChoice")
  }

  return (
    <ComicPanelPage zoneColor="#E63946">
      <div className="flex flex-col gap-6 pt-4 pb-12">
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

        {/* Multi-panel comic layout with new systems */}
        {(isComplete || !currentLine) && (
          <PanelGrid layout="story">
            {/* Panel 1 — Intro (Physics panel with cursor tilt) */}
            <InkReveal direction="left" delay={0}>
              <PhysicsPanel className="p-6" tiltStrength={0.6} delay={0.1}>
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

                {/* Proximity secret — "The First Line" */}
                <SecretMarker
                  secretId="origin-first-line"
                  trigger="proximity"
                  className="mt-4"
                  proximityRadius={100}
                  revealContent={
                    <StoryFragment
                      title="The First Line"
                      text="print('hello world') — typed at midnight, lit only by the monitor's glow. It compiled on the first try. Nothing has been that easy since."
                    />
                  }
                >
                  <div className="font-pixel text-[7px] text-[var(--comic-ink)] opacity-20">
                    &gt; _
                  </div>
                </SecretMarker>
              </PhysicsPanel>
            </InkReveal>

            {/* Panel 2 — Skills (Peelable — hidden content underneath) */}
            <InkReveal direction="right" delay={0.15}>
              <PeelPanel
                onPeel={() => discoverSecret("origin-torn-photo")}
                hiddenContent={
                  <StoryFragment
                    title="Torn Photograph"
                    text="Behind the panel, a faded photograph: a kid staring wide-eyed at a computer screen for the first time. The moment everything changed."
                  />
                }
              >
                <h3 className="font-comic text-xl text-[var(--comic-ink)] mb-3">SKILLS DISCOVERED</h3>
                <div className="flex flex-col gap-2">
                  <LoreEntry title="Frontend Mastery" icon="⚔️">
                    React, Next.js, TypeScript, Tailwind CSS, Framer Motion — primary weapons
                    in the quest to build beautiful, performant interfaces.
                  </LoreEntry>
                  <LoreEntry title="Backend Knowledge" icon="🛡️">
                    Node.js, Python, SQL, REST, GraphQL — tools wielded behind the scenes.
                  </LoreEntry>
                  <LoreEntry title="Tools of the Trade" icon="🔧">
                    Git, Figma, Testing frameworks, CI/CD pipelines — utilities that keep the
                    quest running smoothly.
                  </LoreEntry>
                </div>
              </PeelPanel>
            </InkReveal>
          </PanelGrid>
        )}

        {/* Panel 3 — Philosophy (Breakable — hidden rejection letter) */}
        {(isComplete || !currentLine) && (
          <InkReveal direction="bottom" delay={0.1}>
            <BreakablePanel
              onBreak={() => {
                discoverSecret("origin-broken-panel")
                completeZone("origin")
              }}
              hiddenContent={
                <StoryFragment
                  title="Shattered Expectations"
                  text="The panel cracks open to reveal a rejection letter, crumpled and smoothed out a hundred times. On the back, in pen: 'Try again tomorrow.'"
                />
              }
            >
              <SpeechBubble variant="thought" tail="right" delay={0.6}>
                <p className="text-sm">
                  I believe the best software feels like <em>magic</em> — invisible complexity
                  that creates <ComicEmphasis color="var(--comic-blue)">delightful</ComicEmphasis> experiences.
                </p>
              </SpeechBubble>
              <div className="mt-2 font-pixel text-[7px] text-[var(--comic-ink)] opacity-30 text-center">
                RAPID CLICK TO BREAK
              </div>
            </BreakablePanel>
          </InkReveal>
        )}

        {/* Panel 4 — Currently training (Draggable physics panel) */}
        {(isComplete || !currentLine) && (
          <InkReveal direction="center" delay={0.15}>
            <PhysicsPanel className="p-6" draggable tiltStrength={0.8} delay={0.2}>
              <NarratorBox position="top-left" delay={0.3}>
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
            </PhysicsPanel>
          </InkReveal>
        )}
      </div>
    </ComicPanelPage>
  )
}
