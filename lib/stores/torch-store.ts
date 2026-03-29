import { create } from "zustand"

interface TorchState {
  isLit: boolean
  ignitedAt: number | null
  ignite: () => void
}

export const useTorchStore = create<TorchState>((set, get) => ({
  isLit: false,
  ignitedAt: null,
  ignite: () => {
    if (get().isLit) return
    set({ isLit: true, ignitedAt: performance.now() })
  },
}))
