export interface Project {
  id: string
  title: string
  description: string
  details: string
  tags: string[]
  link?: string
  isSecret?: boolean
  // RPG metadata
  difficulty: number // 1-5
  xpReward: number
  questGiver?: string
}

export const PROJECTS: Project[] = [
  {
    id: "notebook-quest",
    title: "The Portfolio Quest",
    description: "This very website — a comic book RPG that IS the portfolio.",
    details:
      "Built with Next.js 15, Framer Motion, Zustand, and a passion for interactive storytelling. Every zone is playable: scratch-to-reveal treasures, dialogue choices, XP progression, and a full inventory system.",
    tags: ["Next.js", "Framer Motion", "Zustand", "RPG Design"],
    link: "#",
    difficulty: 5,
    xpReward: 30,
    questGiver: "Vasim",
  },
  {
    id: "ai-playground",
    title: "The AI Arena",
    description: "An interactive sandbox for experimenting with language models.",
    details:
      "A full-stack application with streaming responses, prompt templates, and side-by-side model comparison. Built with React, Python FastAPI, and WebSockets.",
    tags: ["React", "Python", "AI/ML", "WebSockets"],
    difficulty: 4,
    xpReward: 30,
    questGiver: "The Artificer",
  },
  {
    id: "design-system",
    title: "The Component Forge",
    description: "A design system with 50+ accessible, themeable components.",
    details:
      "Radix UI primitives, Tailwind CSS, and class-variance-authority for variant management. Documented with Storybook and tested with Playwright.",
    tags: ["TypeScript", "Radix UI", "Tailwind", "Storybook"],
    difficulty: 3,
    xpReward: 30,
    questGiver: "The Blacksmith",
  },
  {
    id: "secret-project",
    title: "??? Secret Quest ???",
    description: "Scratch to reveal what's hiding underneath...",
    details:
      "A real-time collaborative whiteboard with WebRTC for peer connections, CRDT for conflict-free state sync, and Canvas API for smooth drawing at 60fps.",
    tags: ["WebRTC", "CRDT", "Canvas API"],
    isSecret: true,
    difficulty: 5,
    xpReward: 60,
    questGiver: "???",
  },
]
