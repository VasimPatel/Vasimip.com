"use client"

import { motion, AnimatePresence } from "framer-motion"
import { BookOpen, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDiscovery } from "@/hooks/use-discovery"
import { SECRETS, getSecretsForZone } from "@/lib/data/secrets"
import { ZONES } from "@/lib/data/zones"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function DiscoveryJournal() {
  const {
    journalOpen,
    openJournal,
    closeJournal,
    isDiscovered,
    totalFound,
    totalSecrets,
  } = useDiscovery()
  const reducedMotion = useReducedMotion()

  return (
    <>
      {/* Journal toggle button */}
      <button
        onClick={journalOpen ? closeJournal : openJournal}
        className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg",
          "border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]",
          "hover:scale-105 transition-transform shadow-md",
          "font-pixel text-[8px]"
        )}
        aria-label="Toggle discovery journal"
      >
        <BookOpen className="w-4 h-4 text-[var(--comic-ink)]" />
        <span className="text-[var(--comic-ink)]">
          {totalFound}/{totalSecrets}
        </span>
        {/* Notification pip for new discoveries */}
        {totalFound > 0 && (
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--comic-yellow)] border border-[var(--comic-panel-border)]" />
        )}
      </button>

      {/* Journal panel */}
      <AnimatePresence>
        {journalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[60] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeJournal}
            />

            {/* Journal slide-in */}
            <motion.div
              className="fixed top-0 right-0 bottom-0 z-[61] w-full max-w-sm bg-[var(--comic-bg)] border-l-3 border-[var(--comic-panel-border)] shadow-2xl overflow-y-auto"
              initial={reducedMotion ? { opacity: 0 } : { x: "100%" }}
              animate={reducedMotion ? { opacity: 1 } : { x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--comic-bg)] border-b-2 border-[var(--comic-panel-border)]">
                <div>
                  <h2 className="font-comic text-2xl text-[var(--comic-ink)]">
                    DISCOVERY JOURNAL
                  </h2>
                  <p className="font-pixel text-[7px] text-[var(--comic-ink)] opacity-50 mt-1">
                    {totalFound} of {totalSecrets} secrets found
                  </p>
                </div>
                <button
                  onClick={closeJournal}
                  className="p-2 rounded hover:bg-[var(--comic-halftone)] transition-colors"
                  aria-label="Close journal"
                >
                  <X className="w-5 h-5 text-[var(--comic-ink)]" />
                </button>
              </div>

              {/* Progress bar */}
              <div className="px-5 py-3">
                <div className="h-2 rounded-full bg-[var(--comic-halftone)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: "var(--comic-yellow)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(totalFound / totalSecrets) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Zone sections */}
              <div className="px-5 pb-24 space-y-6">
                {ZONES.map((zone) => {
                  const zoneSecrets = getSecretsForZone(zone.id)
                  if (zoneSecrets.length === 0) return null

                  const foundCount = zoneSecrets.filter((s) =>
                    isDiscovered(s.id)
                  ).length

                  return (
                    <div key={zone.id}>
                      {/* Zone header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{zone.icon}</span>
                        <div className="flex-1">
                          <h3 className="font-comic text-base text-[var(--comic-ink)]">
                            {zone.title}
                          </h3>
                          <p className="font-pixel text-[6px] opacity-40">
                            {foundCount}/{zoneSecrets.length} found
                          </p>
                        </div>
                        {foundCount === zoneSecrets.length && (
                          <span className="font-pixel text-[7px] text-[var(--comic-green)]">
                            COMPLETE
                          </span>
                        )}
                      </div>

                      {/* Secret entries */}
                      <div className="space-y-2">
                        {zoneSecrets.map((secret) => {
                          const found = isDiscovered(secret.id)
                          return (
                            <div
                              key={secret.id}
                              className={cn(
                                "p-3 rounded border-2 transition-colors",
                                found
                                  ? "border-[var(--comic-yellow)] bg-[var(--comic-panel)]"
                                  : "border-[var(--comic-panel-border)] bg-[var(--comic-halftone)] opacity-60"
                              )}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs">
                                  {found ? "✦" : "?"}
                                </span>
                                <span
                                  className={cn(
                                    "font-comic text-sm",
                                    found
                                      ? "text-[var(--comic-ink)]"
                                      : "text-[var(--comic-ink)] opacity-50"
                                  )}
                                >
                                  {found ? secret.title : "???"}
                                </span>
                                {found && (
                                  <span className="ml-auto font-pixel text-[6px] text-[var(--comic-yellow)]">
                                    +{secret.xpReward} XP
                                  </span>
                                )}
                              </div>
                              <p
                                className={cn(
                                  "text-xs leading-relaxed",
                                  found
                                    ? "font-caveat text-[var(--comic-ink)] italic"
                                    : "font-pixel text-[7px] text-[var(--comic-ink)] opacity-40"
                                )}
                              >
                                {found ? secret.storyFragment : secret.hint}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
