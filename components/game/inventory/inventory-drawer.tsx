"use client"

import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/lib/stores/game-store"
import { InventoryItem } from "./inventory-item"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface InventoryDrawerProps {
  open: boolean
  onClose: () => void
}

export function InventoryDrawer({ open, onClose }: InventoryDrawerProps) {
  const inventory = useGameStore((s) => s.inventory)
  const reducedMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-[70] w-80 max-w-[85vw] bg-[var(--comic-bg)] border-l-3 border-[var(--comic-panel-border)] shadow-2xl overflow-y-auto comic-scroll"
            initial={reducedMotion ? { opacity: 0 } : { x: "100%" }}
            animate={reducedMotion ? { opacity: 1 } : { x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b-2 border-[var(--comic-panel-border)]">
              <h2 className="font-comic text-2xl text-[var(--comic-ink)]">INVENTORY</h2>
              <button
                onClick={onClose}
                className="p-1 hover:scale-110 transition-transform"
                aria-label="Close inventory"
              >
                <X className="w-5 h-5 text-[var(--comic-ink)]" />
              </button>
            </div>

            {/* Items */}
            <div className="p-4 flex flex-col gap-3">
              {inventory.length === 0 ? (
                <div className="text-center py-8">
                  <p className="font-handwriting text-lg text-[var(--comic-ink)] opacity-60">
                    Your inventory is empty.
                  </p>
                  <p className="font-pixel text-[8px] text-[var(--comic-ink)] opacity-40 mt-2">
                    Explore zones to collect items!
                  </p>
                </div>
              ) : (
                inventory.map((itemId) => (
                  <InventoryItem key={itemId} itemId={itemId} />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
