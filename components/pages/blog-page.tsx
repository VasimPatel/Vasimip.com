"use client"

import { motion } from "framer-motion"
import { NotebookPage } from "@/components/notebook/notebook-page"
import { HiddenText } from "@/components/interactive/hidden-text"
import { BLOG_POSTS } from "@/lib/data/blog-posts"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export function BlogPage() {
  const reducedMotion = useReducedMotion()

  return (
    <NotebookPage>
      <motion.h1
        className="font-[var(--font-caveat)] text-3xl sm:text-4xl text-[var(--notebook-ink)] mb-1 leading-[32px]"
        initial={reducedMotion ? {} : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        Blog / Thoughts
      </motion.h1>
      <div className="w-24 h-[2px] bg-[var(--notebook-ink)] opacity-30 mb-4" />

      {/* Journal entries */}
      <Accordion type="single" collapsible className="space-y-1">
        {BLOG_POSTS.map((post, i) => (
          <motion.div
            key={post.id}
            initial={reducedMotion ? {} : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <AccordionItem
              value={post.id}
              className="border-b border-dashed border-[var(--notebook-ink)]/20"
            >
              <AccordionTrigger className="hover:no-underline py-2 gap-3">
                <div className="flex items-start gap-3 text-left">
                  {/* Date in margin style */}
                  <span className="text-xs text-[var(--notebook-ink)] opacity-40 font-mono whitespace-nowrap mt-0.5">
                    {post.date}
                  </span>
                  <span
                    className="font-[var(--font-caveat)] text-lg sm:text-xl leading-snug"
                    style={{ color: post.inkColor || "var(--notebook-ink)" }}
                  >
                    {post.title}
                    {post.isLatest && (
                      <span className="ml-2 text-xs text-red-500 font-sans">●</span>
                    )}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div
                  className="font-[var(--font-caveat)] text-base sm:text-lg leading-[28px] pl-[60px] sm:pl-[72px] pr-2 pb-2"
                  style={{ color: post.inkColor || "var(--notebook-ink)" }}
                >
                  {post.content}
                </div>
              </AccordionContent>
            </AccordionItem>
          </motion.div>
        ))}
      </Accordion>

      {/* Invisible ink easter egg */}
      <motion.div
        className="mt-6 font-[var(--font-caveat)] text-base text-[var(--notebook-ink)]"
        initial={reducedMotion ? {} : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="opacity-40 text-sm italic mb-1">
          psst... try selecting the text below 👀
        </p>
        <HiddenText>
          You found the invisible ink! The secret to great software is empathy — for your users,
          your teammates, and your future self reading this code at 2am.
        </HiddenText>
      </motion.div>

      {/* Bookmark ribbon on latest post */}
      <div className="absolute top-0 right-4 w-6 h-16 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="w-6 h-20 bg-red-500 shadow-md"
          style={{
            clipPath: "polygon(0 0, 100% 0, 100% 85%, 50% 70%, 0 85%)",
          }}
        />
      </div>
    </NotebookPage>
  )
}
