/**
 * The torch's live state. The hot-path fields (aim, screen, world positions)
 * are MUTABLE and read via getState() inside frame loops — they are never
 * selected in React render, so pointer movement at 60fps triggers zero
 * re-renders. Cursor, touch-drag, and gyro all write `aim` through one path.
 */
import { create } from 'zustand'
import * as THREE from 'three'

export interface TorchStore {
  /** aim in normalized device coords, −1..1 (cursor/touch/gyro all write this) */
  aim: { x: number; y: number }
  /** torch aim in screen pixels (for the DOM reveal) */
  screen: { x: number; y: number }
  /** the lit-pool center on the page, world space (set by Torch each frame) */
  poolWorld: THREE.Vector3
  /** the flame/light position, world space (pool + held-torch offset) */
  flameWorld: THREE.Vector3
  /** current flicker-driven intensity factor (~0.9–1.12) */
  flicker: number
  /** has the reader taken up the torch yet (Threshold onboarding) */
  taken: boolean
  setTaken: (taken: boolean) => void
  /** non-reactive write: mutate aim/screen in place (no notify) */
  setAim: (ndcX: number, ndcY: number, screenX: number, screenY: number) => void
}

export const useTorchStore = create<TorchStore>((set, get) => ({
  aim: { x: 0, y: 0.15 },
  screen: { x: 0, y: 0 },
  poolWorld: new THREE.Vector3(0, 0, 0),
  flameWorld: new THREE.Vector3(0, 0, 5),
  flicker: 1,
  taken: false,
  setTaken: (taken) => set({ taken }),
  setAim: (ndcX, ndcY, screenX, screenY) => {
    // mutate in place — deliberately does NOT call set(): no subscriber notify
    const s = get()
    s.aim.x = ndcX
    s.aim.y = ndcY
    s.screen.x = screenX
    s.screen.y = screenY
  },
}))
