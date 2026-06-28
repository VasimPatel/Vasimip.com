/**
 * The descent — DISCRETE, not free-scroll. The reader moves one depth at a time;
 * each move is a choreographed, weighted plunge (driven by GSAP in useDescent),
 * never an infinite scroll.
 *
 * `position` is the continuous camera position (0..N-1), animated by the GSAP
 * tween between integer depths — frame loops read it. `depth` is the integer
 * target/active depth (reactive: drives the mount-window and which DOM panel is
 * current). `transitioning` gates input so a move can't be interrupted mid-turn.
 */
import { create } from 'zustand'
import { lastDepthIndex } from '@/lib/depths'

export interface DescentStore {
  position: number
  depth: number
  transitioning: boolean
  /** continuous camera position, mutated in place by the GSAP tween (no notify) */
  setPosition: (p: number) => void
  /** reactive: the integer depth + whether a move is in flight */
  setDepthState: (depth: number, transitioning: boolean) => void
}

export const useDescentStore = create<DescentStore>((set, get) => ({
  position: 0,
  depth: 0,
  transitioning: false,
  setPosition: (p) => {
    get().position = p
  },
  setDepthState: (depth, transitioning) => set({ depth, transitioning }),
}))

export const clampDepth = (i: number): number => Math.max(0, Math.min(lastDepthIndex, Math.round(i)))
