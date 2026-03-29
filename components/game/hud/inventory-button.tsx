"use client"

import { Backpack } from "lucide-react"
import { useGameStore } from "@/lib/stores/game-store"

interface InventoryButtonProps {
  onClick: () => void
}

export function InventoryButton({ onClick }: InventoryButtonProps) {
  const inventory = useGameStore((s) => s.inventory)

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-2 py-1.5 rounded border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)] hover:scale-105 transition-transform"
      aria-label={`Inventory: ${inventory.length} items`}
      title="Open inventory"
    >
      <Backpack className="w-4 h-4 text-[var(--comic-green)]" />
      {inventory.length > 0 && (
        <span className="font-pixel text-[8px] text-[var(--comic-ink)]">
          {inventory.length}
        </span>
      )}
    </button>
  )
}
