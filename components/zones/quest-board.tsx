"use client"

import { useState } from "react"
import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { NarratorBox } from "@/components/comic/narrator-box"
import { QuestCard } from "@/components/rpg/quest-card"
import { QuestObjective } from "@/components/rpg/quest-objective"
import { TreasureReveal } from "@/components/interactive/treasure-reveal"
import { useXP } from "@/hooks/use-xp"
import { useAchievements } from "@/hooks/use-achievements"
import { PROJECTS } from "@/lib/data/projects"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

export function QuestBoard() {
  const [selectedProject, setSelectedProject] = useState<typeof PROJECTS[0] | null>(null)
  const { awardXP } = useXP()
  const { discoverAchievement } = useAchievements()

  const handleProjectClick = (project: typeof PROJECTS[0]) => {
    if (project.isSecret) return // Don't open dialog for secret projects
    setSelectedProject(project)
    awardXP("expandProject")
  }

  const handleTreasureReveal = () => {
    discoverAchievement("treasure-hunter")
    awardXP("treasureReveal")
  }

  const secretProject = PROJECTS.find((p) => p.isSecret)
  const regularProjects = PROJECTS.filter((p) => !p.isSecret)

  return (
    <ComicPanelPage zoneColor="#457B9D">
      <div className="flex flex-col gap-6 pt-4 pb-12">
        {/* Zone title */}
        <NarratorBox position="top-left">
          Chapter 2: The Quest Board
        </NarratorBox>

        <h2 className="font-comic text-4xl sm:text-5xl text-[var(--comic-ink)]">
          QUEST BOARD
        </h2>
        <p className="font-handwriting text-lg text-[var(--comic-ink)] opacity-80">
          Choose your quest, adventurer. Each project is a completed mission with its own story.
        </p>

        {/* Quest cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {regularProjects.map((project, i) => (
            <QuestCard
              key={project.id}
              title={project.title}
              description={project.description}
              difficulty={project.difficulty}
              reward={`+${project.xpReward} XP`}
              tags={project.tags}
              onClick={() => handleProjectClick(project)}
              delay={i * 0.15}
            />
          ))}
        </div>

        {/* Secret project — treasure chest */}
        {secretProject && (
          <div className="mt-6">
            <h3 className="font-comic text-2xl text-[var(--comic-ink)] mb-3">
              🔒 HIDDEN QUEST
            </h3>
            <TreasureReveal
              width={400}
              height={200}
              onReveal={handleTreasureReveal}
              className="mx-auto"
            >
              <div className="text-center p-4">
                <h4 className="font-comic text-xl text-[var(--comic-ink)]">
                  {secretProject.title.replace("???", "").replace("???", "").trim() || "Collaborative Whiteboard"}
                </h4>
                <p className="text-sm text-[var(--comic-ink)] mt-2">
                  {secretProject.details}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
                  {secretProject.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] font-pixel border border-[var(--comic-panel-border)] text-[var(--comic-ink)]">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="font-pixel text-[8px] text-[var(--comic-green)] mt-2">
                  +60 XP &bull; Treasure Hunter achievement!
                </p>
              </div>
            </TreasureReveal>
          </div>
        )}

        {/* Decorative quest objectives */}
        <div className="mt-6 p-4 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]">
          <h3 className="font-comic text-xl text-[var(--comic-ink)] mb-3">QUEST OBJECTIVES</h3>
          <QuestObjective>Review each quest posting</QuestObjective>
          <QuestObjective>Discover the hidden treasure</QuestObjective>
          <QuestObjective>Visit all zones in the realm</QuestObjective>
        </div>
      </div>

      {/* Project detail dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="border-3 border-[var(--comic-panel-border)] bg-[var(--comic-bg)]">
          <DialogHeader>
            <DialogTitle className="font-comic text-2xl text-[var(--comic-ink)]">
              {selectedProject?.title}
            </DialogTitle>
            <DialogDescription className="font-handwriting text-base text-[var(--comic-ink)]">
              {selectedProject?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Difficulty & quest giver */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={i < (selectedProject?.difficulty || 0) ? "opacity-100" : "opacity-20"}>
                    ⚔️
                  </span>
                ))}
              </div>
              {selectedProject?.questGiver && (
                <span className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-60">
                  Quest Giver: {selectedProject.questGiver}
                </span>
              )}
            </div>

            {/* Details */}
            <p className="text-sm text-[var(--comic-ink)] leading-relaxed">
              {selectedProject?.details}
            </p>

            {/* Required items (tags) */}
            <div>
              <span className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-60">REQUIRED ITEMS:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selectedProject?.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 text-[10px] font-pixel border border-[var(--comic-panel-border)] text-[var(--comic-ink)] bg-[var(--comic-panel)]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Reward */}
            <div className="font-pixel text-[10px] text-[var(--comic-green)]">
              REWARD: +{selectedProject?.xpReward} XP
            </div>

            {selectedProject?.link && selectedProject.link !== "#" && (
              <a
                href={selectedProject.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-pixel text-[10px] px-4 py-2 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-blue)] text-white hover:scale-105 transition-transform"
              >
                VIEW QUEST →
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ComicPanelPage>
  )
}
