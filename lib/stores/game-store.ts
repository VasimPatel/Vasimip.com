import { create } from "zustand"
import { persist } from "zustand/middleware"
import { getLevelForXP, LEVELS } from "@/lib/data/xp-config"

interface GameState {
  // Navigation
  currentZone: number
  zoneDirection: number // 1 = forward, -1 = backward
  visitedZones: number[]

  // Progression
  xp: number
  level: number
  levelName: string

  // Inventory
  inventory: string[]

  // Dialogue
  dialogueChoices: Record<string, string>
  activeDialogue: string | null

  // Game flags
  hasStartedQuest: boolean
  completedZones: string[]
  soundEnabled: boolean

  // Actions
  setZone: (zone: number) => void
  nextZone: () => void
  prevZone: () => void
  addXP: (amount: number) => void
  addToInventory: (itemId: string) => void
  setDialogueChoice: (dialogueId: string, choiceId: string) => void
  setActiveDialogue: (dialogueId: string | null) => void
  startQuest: () => void
  completeZone: (zoneId: string) => void
  toggleSound: () => void
  resetGame: () => void
}

const TOTAL_ZONES = 6

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      currentZone: 0,
      zoneDirection: 1,
      visitedZones: [0],
      xp: 0,
      level: 1,
      levelName: "Novice Explorer",
      inventory: [],
      dialogueChoices: {},
      activeDialogue: null,
      hasStartedQuest: false,
      completedZones: [],
      soundEnabled: true,

      setZone: (zone: number) => {
        const { currentZone, visitedZones } = get()
        if (zone < 0 || zone >= TOTAL_ZONES || zone === currentZone) return
        const newVisited = visitedZones.includes(zone) ? visitedZones : [...visitedZones, zone]
        set({
          currentZone: zone,
          zoneDirection: zone > currentZone ? 1 : -1,
          visitedZones: newVisited,
        })
      },

      nextZone: () => {
        const { currentZone } = get()
        if (currentZone < TOTAL_ZONES - 1) {
          get().setZone(currentZone + 1)
        }
      },

      prevZone: () => {
        const { currentZone } = get()
        if (currentZone > 0) {
          get().setZone(currentZone - 1)
        }
      },

      addXP: (amount: number) => {
        const { xp, inventory } = get()
        const newXP = xp + amount
        const newLevel = getLevelForXP(newXP)
        const oldLevel = getLevelForXP(xp)

        const updates: Partial<GameState> = {
          xp: newXP,
          level: newLevel.level,
          levelName: newLevel.name,
        }

        // Award level-up badge if leveled up
        if (newLevel.level > oldLevel.level && newLevel.reward) {
          if (!inventory.includes(newLevel.reward)) {
            updates.inventory = [...inventory, newLevel.reward]
          }
        }

        set(updates)
      },

      addToInventory: (itemId: string) => {
        const { inventory } = get()
        if (!inventory.includes(itemId)) {
          set({ inventory: [...inventory, itemId] })
        }
      },

      setDialogueChoice: (dialogueId: string, choiceId: string) => {
        set({ dialogueChoices: { ...get().dialogueChoices, [dialogueId]: choiceId } })
      },

      setActiveDialogue: (dialogueId: string | null) => {
        set({ activeDialogue: dialogueId })
      },

      startQuest: () => {
        set({ hasStartedQuest: true })
      },

      completeZone: (zoneId: string) => {
        const { completedZones } = get()
        if (!completedZones.includes(zoneId)) {
          set({ completedZones: [...completedZones, zoneId] })
        }
      },

      toggleSound: () => set({ soundEnabled: !get().soundEnabled }),

      resetGame: () =>
        set({
          currentZone: 0,
          zoneDirection: 1,
          visitedZones: [0],
          xp: 0,
          level: 1,
          levelName: LEVELS[0].name,
          inventory: [],
          dialogueChoices: {},
          activeDialogue: null,
          hasStartedQuest: false,
          completedZones: [],
        }),
    }),
    {
      name: "comic-rpg-save",
      partialize: (state) => ({
        currentZone: state.currentZone,
        visitedZones: state.visitedZones,
        xp: state.xp,
        level: state.level,
        levelName: state.levelName,
        inventory: state.inventory,
        dialogueChoices: state.dialogueChoices,
        hasStartedQuest: state.hasStartedQuest,
        completedZones: state.completedZones,
        soundEnabled: state.soundEnabled,
      }),
    }
  )
)
