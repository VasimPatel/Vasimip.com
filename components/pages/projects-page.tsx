"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { NotebookPage } from "@/components/notebook/notebook-page"
import { ScratchReveal } from "@/components/interactive/scratch-reveal"
import { ClickableCheckbox } from "@/components/interactive/clickable-checkbox"
import { HandDrawnBorder } from "@/components/decorative/hand-drawn-border"
import { PROJECTS } from "@/lib/data/projects"
import { useEasterEggs } from "@/hooks/use-easter-eggs"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

export function ProjectsPage() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const { discoverEgg } = useEasterEggs()
  const reducedMotion = useReducedMotion()

  const project = PROJECTS.find((p) => p.id === selectedProject)

  return (
    <NotebookPage>
      <motion.h1
        className="font-[var(--font-caveat)] text-3xl sm:text-4xl text-[var(--notebook-ink)] mb-1 leading-[32px]"
        initial={reducedMotion ? {} : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        Projects
      </motion.h1>
      <div className="w-24 h-[2px] bg-[var(--notebook-ink)] opacity-30 mb-4" />

      {/* Project cards */}
      <div className="space-y-4">
        {PROJECTS.map((p, i) => (
          <motion.div
            key={p.id}
            initial={reducedMotion ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            {p.isSecret ? (
              /* Scratch-to-reveal card */
              <HandDrawnBorder className="border-2 border-dashed border-[var(--notebook-ink)] rounded-sm">
                <ScratchReveal
                  width={300}
                  height={120}
                  onReveal={() => discoverEgg("scratch-reveal")}
                >
                  <button
                    onClick={() => setSelectedProject(p.id)}
                    className="text-left w-full h-full p-4"
                  >
                    <h3 className="font-[var(--font-caveat)] text-xl text-[var(--notebook-ink)] font-bold">
                      {p.title.replace("???", "").replace("???", "").trim()}
                    </h3>
                    <p className="font-[var(--font-caveat)] text-sm text-[var(--notebook-ink)] opacity-70 mt-1">
                      A secret project revealed! Click for details.
                    </p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {p.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 border border-[var(--notebook-ink)] rounded-sm opacity-50"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </ScratchReveal>
              </HandDrawnBorder>
            ) : (
              /* Normal project card */
              <button
                onClick={() => setSelectedProject(p.id)}
                className="w-full text-left"
              >
                <HandDrawnBorder className="border border-[var(--notebook-ink)]/30 rounded-sm p-4 hover:bg-[var(--notebook-ink)]/5 transition-colors">
                  <h3 className="font-[var(--font-caveat)] text-xl text-[var(--notebook-ink)] font-bold">
                    {p.title}
                  </h3>
                  <p className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-70 mt-1">
                    {p.description}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 border border-[var(--notebook-ink)] rounded-sm opacity-50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </HandDrawnBorder>
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Margin TODO checkboxes */}
      <div className="mt-6 space-y-2">
        <p className="font-[var(--font-caveat)] text-sm text-[var(--notebook-ink)] opacity-50 uppercase tracking-wider">
          TODO:
        </p>
        <ClickableCheckbox label="Ship secret project" />
        <ClickableCheckbox label="Write blog post about animations" />
        <ClickableCheckbox label="Add more easter eggs" defaultChecked />
      </div>

      {/* Project detail dialog */}
      <Dialog open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        <DialogContent className="bg-[var(--notebook-paper)] border-[var(--notebook-ink)]/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-[var(--font-caveat)] text-2xl text-[var(--notebook-ink)]">
              {project?.title}
            </DialogTitle>
            <DialogDescription className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-70">
              {project?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] leading-relaxed">
              {project?.details}
            </p>
            <div className="flex gap-2 flex-wrap">
              {project?.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 border border-[var(--notebook-ink)]/30 rounded-sm font-[var(--font-caveat)]"
                >
                  {tag}
                </span>
              ))}
            </div>
            {project?.link && (
              <a
                href={project.link}
                className="inline-block font-[var(--font-caveat)] text-base text-blue-600 underline"
              >
                View Project →
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </NotebookPage>
  )
}
