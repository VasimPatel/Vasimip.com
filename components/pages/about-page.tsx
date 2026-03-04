"use client"

import { motion } from "framer-motion"
import { NotebookPage } from "@/components/notebook/notebook-page"
import { HighlighterText } from "@/components/interactive/highlighter-text"
import { StickyNote } from "@/components/interactive/sticky-note"
import { FoldOutSection } from "@/components/interactive/fold-out-section"
import { MarginDoodle } from "@/components/interactive/margin-doodle"
import { useEasterEggs } from "@/hooks/use-easter-eggs"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function AboutPage() {
  const { discoverEgg } = useEasterEggs()
  const reducedMotion = useReducedMotion()

  const lineDelay = reducedMotion ? 0 : 0.08

  return (
    <NotebookPage>
      {/* Margin doodles */}
      <MarginDoodle type="lightbulb" className="-left-14 top-24" delay={0.3} />
      <MarginDoodle type="star" className="-left-14 top-56" delay={0.5} />
      <MarginDoodle type="coffee" className="-left-14 top-[420px]" delay={0.7} />

      {/* Title */}
      <motion.h1
        className="font-[var(--font-caveat)] text-3xl sm:text-4xl text-[var(--notebook-ink)] mb-1 leading-[32px]"
        initial={reducedMotion ? {} : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        About Me
      </motion.h1>
      <div className="w-24 h-[2px] bg-[var(--notebook-ink)] opacity-30 mb-4" />

      {/* Bio paragraphs aligned to ruled lines */}
      <div className="space-y-0 font-[var(--font-caveat)] text-lg sm:text-xl text-[var(--notebook-ink)] leading-[32px]">
        <motion.p
          initial={reducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: lineDelay * 2 }}
        >
          Hey there! I&apos;m <HighlighterText>Vasim</HighlighterText> — a{" "}
          <HighlighterText color="rgba(52, 152, 219, 0.25)">software engineer</HighlighterText>{" "}
          who believes the best code tells a story.
        </motion.p>

        <motion.p
          className="mt-0 pt-0"
          initial={reducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: lineDelay * 5 }}
        >
          I love building things that feel alive — interfaces that respond,
          animations that delight, and experiences that make you want to{" "}
          <HighlighterText color="rgba(46, 204, 113, 0.25)">explore every corner</HighlighterText>.
        </motion.p>

        <motion.p
          initial={reducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: lineDelay * 8 }}
        >
          When I&apos;m not coding, I&apos;m probably sketching UI ideas in a
          real notebook, playing guitar, or debating whether{" "}
          <HighlighterText color="rgba(155, 89, 182, 0.25)">tabs or spaces</HighlighterText>{" "}
          matter. (They do. Tabs.)
        </motion.p>
      </div>

      {/* Sticky note */}
      <motion.div
        className="mt-4 w-48 h-24 relative"
        initial={reducedMotion ? {} : { opacity: 0, rotate: -2 }}
        animate={{ opacity: 1, rotate: -2 }}
        transition={{ delay: 0.5 }}
      >
        <StickyNote
          content={<>📌 Fun fact about me!</>}
          hiddenContent={
            <span>
              I once debugged a production issue while on a rollercoaster. True story. 🎢
            </span>
          }
          onPeel={() => discoverEgg("sticky-note")}
        />
      </motion.div>

      {/* Fold-out section */}
      <motion.div
        className="mt-6"
        initial={reducedMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <FoldOutSection label="Currently Learning">
          <div className="font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] space-y-1 py-2">
            <p>🧠 AI/ML fundamentals & prompt engineering</p>
            <p>🎨 Advanced animation with Framer Motion</p>
            <p>🦀 Rust (slowly but surely!)</p>
            <p>🎵 Music theory & guitar fingerpicking</p>
          </div>
        </FoldOutSection>
      </motion.div>

      <motion.div
        className="mt-4"
        initial={reducedMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <FoldOutSection label="Things I Value">
          <div className="font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] space-y-1 py-2">
            <p>✨ Craft over speed</p>
            <p>🤝 Collaboration over ego</p>
            <p>📖 Learning in public</p>
            <p>♿ Accessibility as a first-class concern</p>
          </div>
        </FoldOutSection>
      </motion.div>
    </NotebookPage>
  )
}
