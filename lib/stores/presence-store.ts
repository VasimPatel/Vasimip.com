import { create } from "zustand"

interface PresenceState {
  cursorX: number
  cursorY: number
  cursorVelocityX: number
  cursorVelocityY: number
  cursorSpeed: number
  isActive: boolean
  lastMoveTime: number
  scrollY: number
  scrollProgress: number
  scrollDirection: "up" | "down" | "idle"
  isMobile: boolean
  setCursor: (x: number, y: number) => void
  setScroll: (y: number, progress: number, direction: "up" | "down" | "idle") => void
  setActive: (active: boolean) => void
  setMobile: (mobile: boolean) => void
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  cursorX: 0,
  cursorY: 0,
  cursorVelocityX: 0,
  cursorVelocityY: 0,
  cursorSpeed: 0,
  isActive: false,
  lastMoveTime: 0,
  scrollY: 0,
  scrollProgress: 0,
  scrollDirection: "idle",
  isMobile: false,

  setCursor: (x: number, y: number) => {
    const { cursorX, cursorY } = get()
    const vx = x - cursorX
    const vy = y - cursorY
    set({
      cursorX: x,
      cursorY: y,
      cursorVelocityX: vx,
      cursorVelocityY: vy,
      cursorSpeed: Math.sqrt(vx * vx + vy * vy),
      isActive: true,
      lastMoveTime: Date.now(),
    })
  },

  setScroll: (y, progress, direction) => {
    set({ scrollY: y, scrollProgress: progress, scrollDirection: direction })
  },

  setActive: (active) => set({ isActive: active }),
  setMobile: (mobile) => set({ isMobile: mobile }),
}))
