"use client"

import { useState, useEffect, useRef } from "react"
import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { ComicPanel } from "@/components/comic/comic-panel"
import { NarratorBox } from "@/components/comic/narrator-box"
import { DialogueBox } from "@/components/rpg/dialogue-box"
import { LoreEntry } from "@/components/interactive/lore-entry"
import { SecretLore } from "@/components/interactive/secret-lore"
import { ComicEmphasis } from "@/components/interactive/comic-emphasis"
import { useDialogue } from "@/hooks/use-dialogue"
import { useXP } from "@/hooks/use-xp"
import { useAchievements } from "@/hooks/use-achievements"
import { useGameStore } from "@/lib/stores/game-store"
import { BLOG_POSTS, TOME_ICONS } from "@/lib/data/blog-posts"

export function TheArchives() {
  const { currentLine, isComplete, advance } = useDialogue("archives-intro")
  const { awardXP } = useXP()
  const { discoverAchievement } = useAchievements()
  const { addToInventory } = useGameStore()
  const [readPosts, setReadPosts] = useState<Set<string>>(new Set())
  const bookwormChecked = useRef(false)

  const handleReadPost = (postId: string) => {
    if (!readPosts.has(postId)) {
      setReadPosts((prev) => new Set([...prev, postId]))
      awardXP("readPost")
    }
  }

  // Check bookworm achievement
  useEffect(() => {
    if (readPosts.size === BLOG_POSTS.length && !bookwormChecked.current) {
      bookwormChecked.current = true
      discoverAchievement("bookworm")
      addToInventory("scroll-archives")
    }
  }, [readPosts, discoverAchievement, addToInventory])

  const handleSecretDecode = () => {
    discoverAchievement("codebreaker")
  }

  return (
    <ComicPanelPage zoneColor="#2A9D8F">
      <div className="flex flex-col gap-6 pt-4 pb-12">
        {/* Zone title */}
        <NarratorBox position="top-left">
          Chapter 3: The Archives
        </NarratorBox>

        <h2 className="font-comic text-4xl sm:text-5xl text-[var(--comic-ink)]">
          THE ARCHIVES
        </h2>

        {/* Intro dialogue */}
        {!isComplete && currentLine && (
          <div className="max-w-2xl">
            <DialogueBox line={currentLine} onAdvance={advance} />
          </div>
        )}

        {/* Floating dust particles */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-[5]" aria-hidden="true">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-[var(--comic-ink)]"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: 0.15,
                animation: `float ${4 + Math.random() * 4}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 4}s`,
              }}
            />
          ))}
        </div>

        {/* Blog posts as tomes */}
        <div className="flex flex-col gap-4 mt-4">
          {BLOG_POSTS.map((post, i) => (
            <ComicPanel key={post.id} delay={i * 0.1} className="overflow-visible">
              <LoreEntry
                title={post.title}
                icon={TOME_ICONS[post.tomeType]}
                onExpand={() => handleReadPost(post.id)}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs opacity-60">
                    <span className="font-pixel text-[8px]">{post.date}</span>
                    <span className="font-pixel text-[8px] uppercase" style={{
                      color: post.rarity === "rare" ? "var(--comic-blue)" :
                             post.rarity === "legendary" ? "var(--comic-yellow)" :
                             post.rarity === "uncommon" ? "var(--comic-green)" :
                             "var(--comic-ink)"
                    }}>
                      {post.rarity}
                    </span>
                    {post.isLatest && (
                      <span className="px-2 py-0.5 bg-[var(--comic-red)] text-white font-pixel text-[7px]">
                        NEW
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--comic-ink)] leading-relaxed">{post.content}</p>
                  <p className="font-pixel text-[8px] text-[var(--comic-green)]">
                    +{post.xpReward} XP
                  </p>
                </div>
              </LoreEntry>
            </ComicPanel>
          ))}
        </div>

        {/* Secret lore */}
        <ComicPanel className="p-6 mt-4" delay={0.5}>
          <h3 className="font-comic text-xl text-[var(--comic-ink)] mb-3">
            ENCRYPTED MANUSCRIPT
          </h3>
          <p className="text-sm text-[var(--comic-ink)] leading-relaxed">
            Deep in the archives, you find a strange manuscript written in{" "}
            <ComicEmphasis color="var(--comic-purple)">ancient runes</ComicEmphasis>.
            Perhaps if you click on it, the text will decode...
          </p>
          <div className="mt-4 p-4 bg-[var(--comic-bg)] border border-[var(--comic-panel-border)]">
            <SecretLore onDecode={handleSecretDecode}>
              The secret to great code is empathy for the next developer who reads it
            </SecretLore>
          </div>
        </ComicPanel>

        {/* Progress indicator */}
        <div className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-40 text-center">
          TOMES READ: {readPosts.size}/{BLOG_POSTS.length}
        </div>
      </div>
    </ComicPanelPage>
  )
}
