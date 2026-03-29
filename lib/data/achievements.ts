export interface AchievementDef {
  id: string
  name: string
  description: string
  hint: string
  icon: string
  xpReward: number
  itemReward?: string
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "treasure-hunter",
    name: "Treasure Hunter",
    description: "Scratched to reveal a hidden treasure chest.",
    hint: "Some things are hidden beneath the surface on the Quest Board...",
    icon: "🏴‍☠️",
    xpReward: 75,
    itemReward: "artifact-treasure-hunter",
  },
  {
    id: "codebreaker",
    name: "Codebreaker",
    description: "Decoded encrypted secret lore.",
    hint: "Select the mysterious text in the Archives...",
    icon: "🔐",
    xpReward: 75,
    itemReward: "artifact-codebreaker",
  },
  {
    id: "dungeon-warrior",
    name: "Dungeon Warrior",
    description: "Won the dungeon puzzle challenge.",
    hint: "Challenge the guardian in the Training Grounds...",
    icon: "⚔️",
    xpReward: 100,
    itemReward: "artifact-warrior",
  },
  {
    id: "sticky-secret",
    name: "Sticky Secret",
    description: "Peeled back a loot drop to find a hidden message.",
    hint: "Look for something to peel on the Origin Story...",
    icon: "📝",
    xpReward: 75,
  },
  {
    id: "world-explorer",
    name: "World Explorer",
    description: "Visited every zone in the realm.",
    hint: "Journey to all six zones...",
    icon: "🌍",
    xpReward: 100,
    itemReward: "artifact-explorer",
  },
  {
    id: "max-level",
    name: "Legendary Status",
    description: "Reached the maximum level.",
    hint: "Keep exploring and interacting...",
    icon: "👑",
    xpReward: 0,
  },
  {
    id: "dialogue-master",
    name: "Dialogue Master",
    description: "Made all available dialogue choices.",
    hint: "Revisit conversations and try different options...",
    icon: "💬",
    xpReward: 75,
  },
  {
    id: "bookworm",
    name: "Bookworm",
    description: "Read all blog posts in the Archives.",
    hint: "Open every tome in the library...",
    icon: "🐛",
    xpReward: 75,
    itemReward: "tool-bookmark",
  },
  {
    id: "konami",
    name: "Classic Gamer",
    description: "Entered the Konami code.",
    hint: "↑ ↑ ↓ ↓ ← → ← → B A",
    icon: "🎮",
    xpReward: 100,
  },
  {
    id: "message-sent",
    name: "Carrier Pigeon",
    description: "Dispatched a message via the Messenger's Guild.",
    hint: "Send a message on the Contact page...",
    icon: "🕊️",
    xpReward: 50,
    itemReward: "scroll-messenger",
  },
]
