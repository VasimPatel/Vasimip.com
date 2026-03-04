"use client"

import { cn } from "@/lib/utils"
import { PAGES } from "@/lib/data/pages"
import { useNotebookStore } from "@/lib/stores/notebook-store"

export function TabStrip() {
  const { currentPage, setPage } = useNotebookStore()

  return (
    <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-10 flex flex-col z-20">
      {PAGES.map((page, index) => {
        const isActive = currentPage === index
        const tabHeight = `${100 / PAGES.length}%`

        return (
          <button
            key={page.id}
            onClick={() => setPage(index)}
            className={cn(
              "relative flex items-center justify-center transition-all duration-200",
              "rounded-r-md text-[10px] sm:text-xs font-medium",
              "hover:w-12 sm:hover:w-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              isActive
                ? "w-10 sm:w-12 shadow-md z-10 text-white"
                : "w-8 sm:w-10 opacity-80 hover:opacity-100"
            )}
            style={{
              height: tabHeight,
              backgroundColor: page.tabColor,
              writingMode: "vertical-rl",
              textOrientation: "mixed",
            }}
            aria-label={`Go to ${page.title}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="rotate-180 select-none tracking-wider">
              {page.tabLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
