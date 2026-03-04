"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { NotebookPage } from "@/components/notebook/notebook-page"
import { TicTacToe } from "@/components/interactive/tic-tac-toe"
import { SKILLS, EXPERIENCES, EDUCATION } from "@/lib/data/skills"
import { useEasterEggs } from "@/hooks/use-easter-eggs"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function SkillBar({ name, level, delay }: { name: string; level: number; delay: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const reducedMotion = useReducedMotion()

  return (
    <div ref={ref} className="flex items-center gap-2 py-0.5">
      <span className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] w-32 sm:w-40 shrink-0 truncate">
        {name}
      </span>
      <div className="flex-1 h-3 border border-[var(--notebook-ink)]/30 rounded-sm overflow-hidden bg-[var(--notebook-paper)]">
        <motion.div
          className="h-full bg-[var(--notebook-ink)]/60 rounded-sm"
          initial={{ width: 0 }}
          animate={inView ? { width: `${level}%` } : { width: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { delay, type: "spring", stiffness: 80, damping: 15 }
          }
        />
      </div>
      <span className="text-xs text-[var(--notebook-ink)] opacity-40 w-8 text-right font-mono">
        {level}%
      </span>
    </div>
  )
}

export function ResumePage() {
  const { discoverEgg } = useEasterEggs()
  const reducedMotion = useReducedMotion()

  return (
    <NotebookPage>
      <motion.h1
        className="font-[var(--font-caveat)] text-3xl sm:text-4xl text-[var(--notebook-ink)] mb-1 leading-[32px]"
        initial={reducedMotion ? {} : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        Resume / Skills
      </motion.h1>
      <div className="w-24 h-[2px] bg-[var(--notebook-ink)] opacity-30 mb-3" />

      <Tabs defaultValue="skills" className="w-full">
        <TabsList className="bg-transparent border-b border-[var(--notebook-ink)]/20 rounded-none w-full justify-start gap-0 h-auto p-0">
          {["skills", "experience", "education"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="font-[var(--font-caveat)] text-base sm:text-lg capitalize rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--notebook-ink)] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-1.5"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="skills" className="mt-3 space-y-0.5">
          <p className="font-[var(--font-caveat)] text-sm text-[var(--notebook-ink)] opacity-50 mb-2 italic">
            * self-assessed, take with a grain of salt
          </p>
          {SKILLS.map((skill, i) => (
            <SkillBar
              key={skill.name}
              name={skill.name}
              level={skill.level}
              delay={i * 0.06}
            />
          ))}
        </TabsContent>

        <TabsContent value="experience" className="mt-3 space-y-4">
          {EXPERIENCES.map((exp, i) => (
            <motion.div
              key={exp.company}
              initial={reducedMotion ? {} : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="border-l-2 border-[var(--notebook-ink)]/30 pl-3"
            >
              <h3 className="font-[var(--font-caveat)] text-xl text-[var(--notebook-ink)] font-bold">
                {exp.role}
              </h3>
              <p className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-60">
                {exp.company} · {exp.period}
              </p>
              <ul className="mt-1 space-y-0.5">
                {exp.highlights.map((h) => (
                  <li
                    key={h}
                    className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-80 before:content-['—_'] before:opacity-40"
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="education" className="mt-3 space-y-3">
          {EDUCATION.map((edu, i) => (
            <motion.div
              key={edu.school}
              initial={reducedMotion ? {} : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <h3 className="font-[var(--font-caveat)] text-xl text-[var(--notebook-ink)] font-bold">
                {edu.degree}
              </h3>
              <p className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-60">
                {edu.school} · {edu.year}
              </p>
              <p className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-70 italic">
                {edu.notes}
              </p>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Tic-tac-toe easter egg in bottom-right area */}
      <div className="absolute bottom-8 -right-2 opacity-60 hover:opacity-100 transition-opacity">
        <p className="text-[9px] text-[var(--notebook-ink)] opacity-40 text-center mb-1 font-mono">
          bored?
        </p>
        <TicTacToe onWin={() => discoverEgg("tic-tac-toe")} />
      </div>
    </NotebookPage>
  )
}
