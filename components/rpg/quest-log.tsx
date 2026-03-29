"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { EXPERIENCES, EDUCATION } from "@/lib/data/skills"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function QuestLog({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion()

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <h3 className="font-comic text-2xl text-[var(--comic-ink)]">QUEST LOG</h3>

      {/* Experience timeline */}
      <div className="relative pl-8 border-l-3 border-[var(--comic-panel-border)]">
        {EXPERIENCES.map((exp, i) => (
          <motion.div
            key={exp.company}
            className="relative mb-6 last:mb-0"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
            whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15, duration: reducedMotion ? 0.15 : 0.4 }}
          >
            {/* Timeline dot */}
            <div className="absolute -left-[calc(2rem+7px)] top-1 w-4 h-4 rounded-full border-3 border-[var(--comic-panel-border)] bg-[var(--comic-yellow)]" />

            <div className="font-comic text-lg text-[var(--comic-ink)]">{exp.role}</div>
            <div className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-60 mb-2">
              {exp.company} &bull; {exp.period}
            </div>
            <ul className="flex flex-col gap-1">
              {exp.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-[var(--comic-ink)]">
                  <span className="text-[var(--comic-green)] mt-0.5">▸</span>
                  {h}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      {/* Education */}
      <div>
        <h4 className="font-comic text-xl text-[var(--comic-ink)] mb-3">ACADEMY RECORDS</h4>
        {EDUCATION.map((edu) => (
          <motion.div
            key={edu.school}
            className="p-3 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="font-comic text-base text-[var(--comic-ink)]">{edu.degree}</div>
            <div className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-60">
              {edu.school} &bull; {edu.year}
            </div>
            <div className="text-sm text-[var(--comic-ink)] opacity-70 mt-1">{edu.notes}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
