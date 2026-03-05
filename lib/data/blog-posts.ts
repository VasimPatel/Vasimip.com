export interface BlogPost {
  id: string
  title: string
  date: string
  content: string
  isLatest?: boolean
  // RPG metadata
  tomeType: "scroll" | "book" | "tome" | "grimoire"
  rarity: "common" | "uncommon" | "rare" | "legendary"
  xpReward: number
}

export const BLOG_POSTS: BlogPost[] = [
  {
    id: "why-notebooks",
    title: "Why I Built My Portfolio as a Comic Book",
    date: "Feb 2026",
    content:
      "There's something deeply satisfying about interactive storytelling. The comic panels, the RPG progression, the hidden secrets — they all carry a sense of adventure. Every zone is an invitation to explore. I wanted my portfolio to feel the same way: not a sterile showcase, but a living quest that rewards curiosity.",
    isLatest: true,
    tomeType: "grimoire",
    rarity: "rare",
    xpReward: 25,
  },
  {
    id: "animation-philosophy",
    title: "Animation as Communication",
    date: "Jan 2026",
    content:
      "Good animation isn't decoration — it's communication. When a zone transitions with a diagonal wipe, it tells you 'you're moving through the world.' When a loot drop peels back, it says 'there's a reward here.' Every motion should answer a question the user didn't know they were asking.",
    tomeType: "tome",
    rarity: "uncommon",
    xpReward: 25,
  },
  {
    id: "learning-in-public",
    title: "On Learning in Public",
    date: "Dec 2025",
    content:
      "The best way to learn is to teach. Writing about what I'm learning forces me to understand it deeply enough to explain it simply. This blog is my quest log — messy, honest, and full of crossed-out failures that led somewhere interesting.",
    tomeType: "book",
    rarity: "common",
    xpReward: 25,
  },
  {
    id: "craft-of-code",
    title: "The Craft of Clean Code",
    date: "Nov 2025",
    content:
      "Code is read far more often than it's written. I treat every function like a spell incantation: it should be clear, precise, and do one thing well. The best code reads like well-written lore — you understand the intent before you understand the implementation.",
    tomeType: "scroll",
    rarity: "common",
    xpReward: 25,
  },
]

export const TOME_ICONS: Record<string, string> = {
  scroll: "📜",
  book: "📕",
  tome: "📗",
  grimoire: "📔",
}
