"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ComicPanelPage } from "@/components/game/comic-panel-page"
import { NarratorBox } from "@/components/comic/narrator-box"
import { ActionText } from "@/components/comic/action-text"
import { PhysicsPanel } from "@/components/panels/physics-panel"
import { InkReveal } from "@/components/ink/ink-reveal"
import { SecretMarker } from "@/components/discovery/secret-marker"
import { StoryFragment } from "@/components/discovery/story-fragment"
import { useXP } from "@/hooks/use-xp"
import { useDiscovery } from "@/hooks/use-discovery"
import { useGameStore } from "@/lib/stores/game-store"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { cn } from "@/lib/utils"

type QuestType = "battle" | "alliance" | "greetings"

export function MessengersGuild() {
  const { awardXP } = useXP()
  const { discoverSecret } = useDiscovery()
  const { addToInventory, completeZone } = useGameStore()
  const reducedMotion = useReducedMotion()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [questType, setQuestType] = useState<QuestType>("greetings")
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !message) return

    setSending(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setSending(false)
    setSent(true)
    awardXP("sendMessage")
    addToInventory("scroll-messenger")
    completeZone("messenger")
  }

  const questTypeOptions: { value: QuestType; label: string; icon: string }[] = [
    { value: "battle", label: "Summon for Battle", icon: "⚔️" },
    { value: "alliance", label: "Alliance Proposal", icon: "🤝" },
    { value: "greetings", label: "Sending Greetings", icon: "👋" },
  ]

  return (
    <ComicPanelPage zoneColor="#7B2D8E">
      <div className="flex flex-col gap-6 pt-4 pb-12">
        <NarratorBox position="top-left">
          Chapter 5: Messenger&apos;s Guild
        </NarratorBox>

        <InkReveal direction="left">
          <h2 className="font-comic text-4xl sm:text-5xl text-[var(--comic-ink)]">
            MESSENGER&apos;S GUILD
          </h2>
          <p className="font-handwriting text-lg text-[var(--comic-ink)] opacity-80 mt-2">
            Send a message via carrier pigeon. The guild master ensures swift delivery.
          </p>
        </InkReveal>

        {/* Pigeon Coop secret — proximity */}
        <SecretMarker
          secretId="messenger-pigeon-coop"
          trigger="proximity"
          proximityRadius={100}
          revealContent={
            <StoryFragment
              title="The Pigeon Coop"
              text="You discover a roost of carrier pigeons, each with a tiny scroll: past messages of encouragement, collaboration, and opportunity. Connection is the real quest."
            />
          }
        >
          <div className="font-pixel text-[7px] text-[var(--comic-ink)] opacity-15 text-center">
            ~ coo coo ~
          </div>
        </SecretMarker>

        <AnimatePresence mode="wait">
          {!sent ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <InkReveal direction="center" delay={0.05}>
                <PhysicsPanel className="p-6" tiltStrength={0.2}>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div>
                      <label className="font-comic text-base text-[var(--comic-ink)] mb-1.5 block">
                        Adventurer Name:
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-bg)] text-[var(--comic-ink)] font-handwriting text-lg focus:outline-none focus:border-[var(--comic-purple)]"
                        placeholder="Your heroic name..."
                      />
                    </div>

                    <div>
                      <label className="font-comic text-base text-[var(--comic-ink)] mb-1.5 block">
                        Messenger Address:
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-bg)] text-[var(--comic-ink)] font-handwriting text-lg focus:outline-none focus:border-[var(--comic-purple)]"
                        placeholder="your@scroll.address"
                      />
                    </div>

                    <div>
                      <label className="font-comic text-base text-[var(--comic-ink)] mb-2 block">
                        Quest Type:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {questTypeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setQuestType(option.value)}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 border-2 border-[var(--comic-panel-border)] font-pixel text-[9px] transition-colors",
                              questType === option.value
                                ? "bg-[var(--comic-purple)] text-white"
                                : "bg-[var(--comic-panel)] text-[var(--comic-ink)] hover:bg-[var(--comic-halftone)]"
                            )}
                          >
                            {option.icon} {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-comic text-base text-[var(--comic-ink)] mb-1.5 block">
                        Your Message:
                      </label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        rows={5}
                        className="w-full px-4 py-2.5 border-2 border-[var(--comic-panel-border)] bg-[var(--comic-bg)] text-[var(--comic-ink)] font-handwriting text-lg focus:outline-none focus:border-[var(--comic-purple)] resize-none"
                        placeholder="Write your message on this scroll..."
                      />
                    </div>

                    <motion.button
                      type="submit"
                      disabled={sending}
                      className="self-start font-pixel text-sm px-6 py-3 border-3 border-[var(--comic-panel-border)] bg-[var(--comic-purple)] text-white hover:scale-105 transition-transform disabled:opacity-50"
                      style={{ boxShadow: "3px 3px 0 var(--comic-panel-shadow)" }}
                      whileHover={reducedMotion ? {} : { scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {sending ? "DISPATCHING..." : "DISPATCH CARRIER PIGEON"}
                    </motion.button>
                  </form>
                </PhysicsPanel>
              </InkReveal>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              className="flex flex-col items-center gap-6 py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className="text-7xl"
                initial={reducedMotion ? {} : { y: 0, x: 0 }}
                animate={reducedMotion ? {} : {
                  y: [0, -40, -80, -40, 0],
                  x: [0, 20, 60, 100, 140],
                }}
                transition={{ duration: 2, ease: "easeInOut" }}
              >
                🕊️
              </motion.div>

              <ActionText text="MESSAGE DISPATCHED!" color="var(--comic-purple)" size="md" />

              <PhysicsPanel className="p-6 text-center max-w-md">
                <p className="font-handwriting text-lg text-[var(--comic-ink)]">
                  Your carrier pigeon soars through the sky! The guild master ensures your message
                  will arrive safely.
                </p>
                <p className="font-pixel text-[10px] text-[var(--comic-green)] mt-3">
                  +50 XP &bull; Guild Membership Card acquired!
                </p>
              </PhysicsPanel>

              <button
                onClick={() => setSent(false)}
                className="font-pixel text-[9px] text-[var(--comic-ink)] opacity-50 hover:opacity-100 underline"
              >
                SEND ANOTHER MESSAGE
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dead Drop secret — drag trigger */}
        <SecretMarker
          secretId="messenger-dead-drop"
          trigger="drag"
          revealContent={
            <StoryFragment
              title="Dead Drop"
              text="A loose stone in the wall hides a final note: 'Thanks for exploring. The real treasure was the curiosity you brought with you.'"
            />
          }
        >
          <PhysicsPanel className="p-3" draggable tiltStrength={0.2}>
            <div className="font-pixel text-[7px] text-[var(--comic-ink)] opacity-30 text-center">
              loose stone — drag to move
            </div>
          </PhysicsPanel>
        </SecretMarker>
      </div>
    </ComicPanelPage>
  )
}
