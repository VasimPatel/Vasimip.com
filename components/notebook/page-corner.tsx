"use client"

import { cn } from "@/lib/utils"
import { useNotebookStore } from "@/lib/stores/notebook-store"

export function PageCorner() {
  const { currentPage, totalPages, nextPage } = useNotebookStore()

  if (currentPage >= totalPages - 1) return null

  return (
    <button
      onClick={nextPage}
      className={cn(
        "absolute bottom-0 right-8 sm:right-10 w-12 h-12 z-20",
        "cursor-pointer group"
      )}
      aria-label="Next page"
    >
      {/* Curled corner effect */}
      <div
        className={cn(
          "absolute bottom-0 right-0 w-0 h-0 transition-all duration-300 ease-out",
          "border-b-[24px] border-r-[24px]",
          "border-b-[var(--notebook-paper)] border-r-[var(--notebook-desk)]",
          "group-hover:border-b-[40px] group-hover:border-r-[40px]",
          "shadow-[-2px_-2px_4px_rgba(0,0,0,0.1)]"
        )}
        style={{
          filter: "drop-shadow(-1px -1px 2px rgba(0,0,0,0.15))",
        }}
      />
    </button>
  )
}
