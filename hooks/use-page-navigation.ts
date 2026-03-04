"use client"

import { useEffect } from "react"
import { useNotebookStore } from "@/lib/stores/notebook-store"
import { PAGE_HASH_MAP, PAGES } from "@/lib/data/pages"

export function usePageNavigation() {
  const { currentPage, setPage, nextPage, prevPage } = useNotebookStore()

  // Sync hash on page change
  useEffect(() => {
    const hash = `#${PAGES[currentPage].id}`
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash)
    }
  }, [currentPage])

  // Read hash on mount
  useEffect(() => {
    const hash = window.location.hash
    if (hash && PAGE_HASH_MAP[hash] !== undefined) {
      setPage(PAGE_HASH_MAP[hash])
    }

    const handleHashChange = () => {
      const newHash = window.location.hash
      if (newHash && PAGE_HASH_MAP[newHash] !== undefined) {
        setPage(PAGE_HASH_MAP[newHash])
      }
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [setPage])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        nextPage()
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        prevPage()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [nextPage, prevPage])

  return { currentPage, setPage, nextPage, prevPage }
}
