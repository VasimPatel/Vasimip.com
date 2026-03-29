"use client"

import { cn } from "@/lib/utils"
import { INVENTORY_ITEMS, RARITY_COLORS, type InventoryItemDef } from "@/lib/data/inventory-items"

interface InventoryItemProps {
  itemId: string
  className?: string
}

export function InventoryItem({ itemId, className }: InventoryItemProps) {
  const item: InventoryItemDef | undefined = INVENTORY_ITEMS[itemId]
  if (!item) return null

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded border-2 border-[var(--comic-panel-border)] bg-[var(--comic-panel)]",
        className
      )}
      style={{ borderLeftColor: RARITY_COLORS[item.rarity], borderLeftWidth: 4 }}
    >
      <span className="text-2xl flex-shrink-0">{item.icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-comic text-sm text-[var(--comic-ink)] leading-tight">
          {item.name}
        </span>
        <span className="font-pixel text-[7px] uppercase" style={{ color: RARITY_COLORS[item.rarity] }}>
          {item.rarity}
        </span>
        <span className="text-xs text-[var(--comic-ink)] opacity-70 leading-snug">
          {item.description}
        </span>
      </div>
    </div>
  )
}
