"use client"

import { useCallback } from "react"
import { DeskSurface } from "@/components/decorative/desk-surface"
import { SvgFilterDefs } from "@/components/decorative/svg-filter-defs"
import { TabStrip } from "@/components/notebook/tab-strip"
import { PageCorner } from "@/components/notebook/page-corner"
import { PageFlipContainer } from "@/components/notebook/page-flip-container"
import { ThemeToggle } from "@/components/notebook/theme-toggle"
import { usePageNavigation } from "@/hooks/use-page-navigation"
import { useNotebookStore } from "@/lib/stores/notebook-store"
import { PAGES } from "@/lib/data/pages"

import { CoverPage } from "@/components/pages/cover-page"
import { AboutPage } from "@/components/pages/about-page"
import { ProjectsPage } from "@/components/pages/projects-page"
import { BlogPage } from "@/components/pages/blog-page"
import { ResumePage } from "@/components/pages/resume-page"
import { ContactPage } from "@/components/pages/contact-page"

const PAGE_COMPONENTS = [CoverPage, AboutPage, ProjectsPage, BlogPage, ResumePage, ContactPage]

export function NotebookShell() {
  usePageNavigation()
  const { currentPage, setPage, nextPage, prevPage } = useNotebookStore()

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (direction === "left") nextPage()
      else prevPage()
    },
    [nextPage, prevPage]
  )

  // Touch swipe handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    ;(e.currentTarget as HTMLElement).dataset.touchStartX = String(touch.clientX)
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = Number((e.currentTarget as HTMLElement).dataset.touchStartX)
      const endX = e.changedTouches[0].clientX
      const diff = endX - startX
      if (Math.abs(diff) > 50) {
        handleSwipe(diff < 0 ? "left" : "right")
      }
    },
    [handleSwipe]
  )

  const CurrentPageComponent = PAGE_COMPONENTS[currentPage]

  return (
    <DeskSurface>
      <SvgFilterDefs />
      <ThemeToggle />

      {/* Notebook container */}
      <div
        className="relative w-full max-w-3xl aspect-[8.5/11] rounded-sm shadow-2xl overflow-visible"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="region"
        aria-label="Composition notebook"
        aria-roledescription="notebook"
      >
        {/* Notebook spine */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-900 rounded-l-sm z-30 shadow-[2px_0_4px_rgba(0,0,0,0.3)]" />

        {/* Tab strip */}
        <TabStrip />

        {/* Page area */}
        <div className="absolute left-3 top-0 bottom-0 right-8 sm:right-10">
          <PageFlipContainer pageKey={currentPage}>
            <CurrentPageComponent />
          </PageFlipContainer>
        </div>

        {/* Page corner curl */}
        <PageCorner />

        {/* Page counter */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 text-[10px] text-[var(--notebook-ink)] opacity-40 font-[var(--font-caveat)]">
          {currentPage + 1} / {PAGES.length}
        </div>
      </div>
    </DeskSurface>
  )
}
