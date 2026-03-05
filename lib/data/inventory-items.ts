export type ItemRarity = "common" | "uncommon" | "rare" | "legendary"
export type ItemCategory = "badge" | "artifact" | "scroll" | "tool"

export interface InventoryItemDef {
  id: string
  name: string
  description: string
  icon: string
  rarity: ItemRarity
  category: ItemCategory
}

export const INVENTORY_ITEMS: Record<string, InventoryItemDef> = {
  // Level badges
  "badge-novice": {
    id: "badge-novice",
    name: "Novice Badge",
    description: "Awarded for beginning the quest.",
    icon: "🛡️",
    rarity: "common",
    category: "badge",
  },
  "badge-page-turner": {
    id: "badge-page-turner",
    name: "Page Turner Badge",
    description: "Reached Level 2 — you're getting the hang of this.",
    icon: "📖",
    rarity: "common",
    category: "badge",
  },
  "badge-quest-seeker": {
    id: "badge-quest-seeker",
    name: "Quest Seeker Badge",
    description: "Reached Level 3 — a true adventurer.",
    icon: "🗺️",
    rarity: "uncommon",
    category: "badge",
  },
  "badge-lore-keeper": {
    id: "badge-lore-keeper",
    name: "Lore Keeper Badge",
    description: "Reached Level 4 — guardian of knowledge.",
    icon: "📜",
    rarity: "uncommon",
    category: "badge",
  },
  "badge-code-knight": {
    id: "badge-code-knight",
    name: "Code Knight Badge",
    description: "Reached Level 5 — warrior of the digital realm.",
    icon: "⚔️",
    rarity: "rare",
    category: "badge",
  },
  "badge-legendary": {
    id: "badge-legendary",
    name: "Legendary Hero Badge",
    description: "Reached max level — you are a legend.",
    icon: "👑",
    rarity: "legendary",
    category: "badge",
  },

  // Zone completion scrolls
  "scroll-origin": {
    id: "scroll-origin",
    name: "Scroll of Origin",
    description: "Completed the Origin Story zone.",
    icon: "📜",
    rarity: "common",
    category: "scroll",
  },
  "scroll-quests": {
    id: "scroll-quests",
    name: "Quest Board Map",
    description: "Explored all quests on the board.",
    icon: "🗺️",
    rarity: "common",
    category: "scroll",
  },
  "scroll-archives": {
    id: "scroll-archives",
    name: "Ancient Tome",
    description: "Read through the Archives.",
    icon: "📚",
    rarity: "uncommon",
    category: "scroll",
  },
  "scroll-training": {
    id: "scroll-training",
    name: "Training Certificate",
    description: "Completed the Training Grounds.",
    icon: "🏆",
    rarity: "uncommon",
    category: "scroll",
  },
  "scroll-messenger": {
    id: "scroll-messenger",
    name: "Guild Membership Card",
    description: "Sent a message via the Messenger's Guild.",
    icon: "🕊️",
    rarity: "uncommon",
    category: "scroll",
  },

  // Achievement artifacts
  "artifact-treasure-hunter": {
    id: "artifact-treasure-hunter",
    name: "Treasure Hunter's Lens",
    description: "Discovered a hidden treasure.",
    icon: "🔍",
    rarity: "rare",
    category: "artifact",
  },
  "artifact-codebreaker": {
    id: "artifact-codebreaker",
    name: "Codebreaker's Ring",
    description: "Decoded secret lore.",
    icon: "💍",
    rarity: "rare",
    category: "artifact",
  },
  "artifact-warrior": {
    id: "artifact-warrior",
    name: "Warrior's Gauntlet",
    description: "Won the dungeon puzzle challenge.",
    icon: "🥊",
    rarity: "rare",
    category: "artifact",
  },
  "artifact-explorer": {
    id: "artifact-explorer",
    name: "Explorer's Compass",
    description: "Visited every zone in the realm.",
    icon: "🧭",
    rarity: "legendary",
    category: "artifact",
  },

  // Tools
  "tool-bookmark": {
    id: "tool-bookmark",
    name: "Magical Bookmark",
    description: "A glowing bookmark that remembers your place.",
    icon: "🔖",
    rarity: "common",
    category: "tool",
  },
  "tool-quill": {
    id: "tool-quill",
    name: "Enchanted Quill",
    description: "A quill that writes with magical ink.",
    icon: "🪶",
    rarity: "uncommon",
    category: "tool",
  },
}

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: "#9CA3AF",
  uncommon: "#2A9D8F",
  rare: "#457B9D",
  legendary: "#FFD700",
}
