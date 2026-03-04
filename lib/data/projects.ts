export interface Project {
  id: string
  title: string
  description: string
  details: string
  tags: string[]
  link?: string
  isSecret?: boolean
}

export const PROJECTS: Project[] = [
  {
    id: "notebook-quest",
    title: "Notebook Quest",
    description: "This very website — a composition notebook that IS the portfolio.",
    details:
      "Built with Next.js 15, Framer Motion, and a love for skeuomorphic design. Every page is interactive: scratch-to-reveal, fold-outs, hidden easter eggs, and hand-drawn SVG animations.",
    tags: ["Next.js", "Framer Motion", "SVG Animation"],
    link: "#",
  },
  {
    id: "ai-playground",
    title: "AI Playground",
    description: "An interactive sandbox for experimenting with language models.",
    details:
      "A full-stack application with streaming responses, prompt templates, and side-by-side model comparison. Built with React, Python FastAPI, and WebSockets.",
    tags: ["React", "Python", "AI/ML"],
  },
  {
    id: "design-system",
    title: "Component Library",
    description: "A design system with 50+ accessible, themeable components.",
    details:
      "Radix UI primitives, Tailwind CSS, and class-variance-authority for variant management. Documented with Storybook and tested with Playwright.",
    tags: ["TypeScript", "Radix UI", "Tailwind"],
  },
  {
    id: "secret-project",
    title: "??? Secret Project ???",
    description: "Scratch to reveal what's hiding underneath...",
    details:
      "A real-time collaborative whiteboard with WebRTC for peer connections, CRDT for conflict-free state sync, and Canvas API for smooth drawing at 60fps.",
    tags: ["WebRTC", "CRDT", "Canvas API"],
    isSecret: true,
  },
]
