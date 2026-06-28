/**
 * prefers-reduced-motion, as a store every subsystem reads. When true: the
 * flicker locks to steady (the torch still tracks, just doesn't flicker),
 * embers freeze, parallax/page-turns become weighted cross-dissolves, and the
 * reveal floor lifts so reading is never a motion-dependent hunt (brief §5).
 */
import { create } from 'zustand'

export interface MotionStore {
  reduced: boolean
  setReduced: (reduced: boolean) => void
}

const initial =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const useMotionStore = create<MotionStore>((set) => ({
  reduced: !!initial,
  setReduced: (reduced) => set({ reduced }),
}))
