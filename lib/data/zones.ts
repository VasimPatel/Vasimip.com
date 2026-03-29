export interface ZoneDefinition {
  id: string
  index: number
  title: string
  subtitle: string
  color: string
  icon: string
  transition: "diagonal" | "horizontal" | "radial" | "smash" | "vertical" | "fade"
  xpReward: number
  hash: string
}

export const ZONES: ZoneDefinition[] = [
  {
    id: "title",
    index: 0,
    title: "Title Screen",
    subtitle: "Press Start",
    color: "#FFD700",
    icon: "⚔️",
    transition: "fade",
    xpReward: 0,
    hash: "#title",
  },
  {
    id: "origin",
    index: 1,
    title: "Origin Story",
    subtitle: "About Me",
    color: "#E63946",
    icon: "📖",
    transition: "diagonal",
    xpReward: 50,
    hash: "#origin",
  },
  {
    id: "quest-board",
    index: 2,
    title: "Quest Board",
    subtitle: "Projects",
    color: "#457B9D",
    icon: "📋",
    transition: "horizontal",
    xpReward: 50,
    hash: "#quests",
  },
  {
    id: "archives",
    index: 3,
    title: "The Archives",
    subtitle: "Blog",
    color: "#2A9D8F",
    icon: "📚",
    transition: "radial",
    xpReward: 50,
    hash: "#archives",
  },
  {
    id: "training",
    index: 4,
    title: "Training Grounds",
    subtitle: "Resume & Skills",
    color: "#F77F00",
    icon: "⚔️",
    transition: "smash",
    xpReward: 50,
    hash: "#training",
  },
  {
    id: "messenger",
    index: 5,
    title: "Messenger's Guild",
    subtitle: "Contact",
    color: "#7B2D8E",
    icon: "🕊️",
    transition: "vertical",
    xpReward: 50,
    hash: "#messenger",
  },
]

export const ZONE_HASH_MAP: Record<string, number> = Object.fromEntries(
  ZONES.map((z) => [z.hash, z.index])
)
