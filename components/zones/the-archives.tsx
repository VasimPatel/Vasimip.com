"use client"

import { useState, useEffect, useRef } from "react"
import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { NarratorBox } from "@/components/comic/narrator-box"
import { DialogueBox } from "@/components/rpg/dialogue-box"
import { LoreEntry } from "@/components/interactive/lore-entry"
import { SecretLore } from "@/components/interactive/secret-lore"
import { ComicEmphasis } from "@/components/interactive/comic-emphasis"
import { PhysicsPanel } from "@/components/panels/physics-panel"
import { BreakablePanel } from "@/components/panels/breakable-panel"
import { InkReveal } from "@/components/ink/ink-reveal"
import { SecretMarker } from "@/components/discovery/secret-marker"
import { StoryFragment } from "@/components/discovery/story-fragment"
import { ParticleField } from "@/components/world/particle-field"
import { useDialogue } from "@/hooks/use-dialogue"
import { useXP } from "@/hooks/use-xp"
import { useDiscovery } from "@/hooks/use-discovery"
import { useGameStore } from "@/lib/stores/game-store"
import { BLOG_POSTS, TOME_ICONS } from "@/lib/data/blog-posts"

export function TheArchives() {
  const { currentLine, isComplete, advance } = useDialogue("archives-intro")
  const { awardXP } = useXP()
  const { discoverSecret } = useDiscovery()
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
      addToInventory("scroll-archives")
    }
  }, [readPosts, addToInventory])

  const handleSecretDecode = () => {
    discoverSecret("archives-cipher")
  }

  return (
    <ComicPanelPage zoneColor="#2A9D8F">
      <div className="relative flex flex-col gap-6 pt-4 pb-12">
        {/* Floating dust particles */}
        <ParticleField count={12} color="var(--comic-ink)" />

        <NarratorBox position="top-left">
          Chapter 3: The Archives
        </NarratorBox>

        <InkReveal direction="left">
          <h2 className="font-comic text-4xl sm:text-5xl text-[var(--comic-ink)]">
            THE ARCHIVES
          </h2>
        </InkReveal>

        {/* Intro dialogue */}
        {!isComplete && currentLine && (
          <div className="max-w-2xl">
            <DialogueBox line={currentLine} onAdvance={advance} />
          </div>
        )}

        {/* Blog posts as tomes — each in a physics panel */}
        <div className="flex flex-col gap-4 mt-4">
          {BLOG_POSTS.map((post, i) => (
            <InkReveal key={post.id} direction={i % 2 === 0 ? "left" : "right"} delay={i * 0.06}>
              <PhysicsPanel delay={i * 0.08} tiltStrength={0.3} className="overflow-visible">
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
              </PhysicsPanel>
            </InkReveal>
          ))}
        </div>

        {/* Margin Note — proximity secret */}
        <SecretMarker
          secretId="archives-margin-note"
          trigger="proximity"
          proximityRadius={90}
          revealContent={
            <StoryFragment
              title="Margin Note"
              text="Scrawled in the margin: 'Read this three times. Then read it again.' The best insights always need rereading."
            />
          }
        >
          <div className="font-caveat text-xs text-[var(--comic-ink)] opacity-15 -rotate-3 ml-2">
            read this three times...
          </div>
        </SecretMarker>

        {/* Secret lore — encrypted manuscript (sequence trigger) */}
        <InkReveal direction="center" delay={0.1}>
          <PhysicsPanel className="p-6" tiltStrength={0.5}>
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
          </PhysicsPanel>
        </InkReveal>

        {/* Invisible Ink secret — ink trigger hint */}
        <SecretMarker
          secretId="archives-invisible-ink"
          trigger="click"
          revealContent={
            <StoryFragment
              title="Invisible Ink"
              text="Your ink trail reveals hidden text glowing beneath the page: 'The cursor is mightier than the sword.'"
            />
          }
        >
          <div className="p-3 border border-dashed border-[var(--comic-ink)] opacity-10 hover:opacity-30 transition-opacity text-center cursor-pointer">
            <span className="font-pixel text-[7px] text-[var(--comic-ink)]">
              something is hidden here...
            </span>
          </div>
        </SecretMarker>

        {/* Progress indicator */}
        <div className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-40 text-center">
          TOMES READ: {readPosts.size}/{BLOG_POSTS.length}
        </div>
      </div>
    </ComicPanelPage>
  )
}
