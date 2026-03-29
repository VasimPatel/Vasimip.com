export const XP_ACTIONS = {
  visitZone: 50,
  readPost: 25,
  expandProject: 30,
  discoverAchievement: 75,
  winMiniGame: 100,
  dialogueChoice: 15,
  treasureReveal: 60,
  sendMessage: 50,
} as const

export type XPAction = keyof typeof XP_ACTIONS

export interface LevelDef {
  level: number
  threshold: number
  name: string
  reward?: string
}

export const LEVELS: LevelDef[] = [
  { level: 1, threshold: 0, name: "Novice Explorer", reward: "badge-novice" },
  { level: 2, threshold: 100, name: "Page Turner", reward: "badge-page-turner" },
  { level: 3, threshold: 250, name: "Quest Seeker", reward: "badge-quest-seeker" },
  { level: 4, threshold: 500, name: "Lore Keeper", reward: "badge-lore-keeper" },
  { level: 5, threshold: 800, name: "Code Knight", reward: "badge-code-knight" },
  { level: 6, threshold: 1200, name: "Legendary Hero", reward: "badge-legendary" },
]

export function getLevelForXP(xp: number): LevelDef {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].threshold) return LEVELS[i]
  }
  return LEVELS[0]
}

export function getXPToNextLevel(xp: number): { current: number; next: number; progress: number } {
  const currentLevel = getLevelForXP(xp)
  const nextLevelIndex = LEVELS.findIndex((l) => l.level === currentLevel.level + 1)
  if (nextLevelIndex === -1) {
    return { current: xp, next: xp, progress: 100 }
  }
  const nextLevel = LEVELS[nextLevelIndex]
  const progress = ((xp - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold)) * 100
  return { current: xp - currentLevel.threshold, next: nextLevel.threshold - currentLevel.threshold, progress }
}
