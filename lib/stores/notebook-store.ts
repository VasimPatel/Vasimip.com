import { create } from "zustand"

interface NotebookState {
  currentPage: number
  pageDirection: number // 1 = forward, -1 = backward
  visitedPages: Set<number>
  totalPages: number
  setPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  currentPage: 0,
  pageDirection: 1,
  visitedPages: new Set([0]),
  totalPages: 6,
  setPage: (page: number) => {
    const { currentPage, visitedPages, totalPages } = get()
    if (page < 0 || page >= totalPages || page === currentPage) return
    set({
      currentPage: page,
      pageDirection: page > currentPage ? 1 : -1,
      visitedPages: new Set([...visitedPages, page]),
    })
  },
  nextPage: () => {
    const { currentPage, totalPages } = get()
    if (currentPage < totalPages - 1) {
      get().setPage(currentPage + 1)
    }
  },
  prevPage: () => {
    const { currentPage } = get()
    if (currentPage > 0) {
      get().setPage(currentPage - 1)
    }
  },
}))
