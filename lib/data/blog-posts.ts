export interface BlogPost {
  id: string
  title: string
  date: string
  content: string
  inkColor?: string
  isLatest?: boolean
}

export const BLOG_POSTS: BlogPost[] = [
  {
    id: "why-notebooks",
    title: "Why I Built My Portfolio as a Notebook",
    date: "Feb 2026",
    content:
      "There's something deeply satisfying about the tactile feel of a composition notebook. The ruled lines, the marble cover, the red margin — they all carry a sense of potential. Every blank page is an invitation. I wanted my portfolio to feel the same way: not a sterile showcase, but a living document that invites exploration.",
    inkColor: "#2c3e50",
    isLatest: true,
  },
  {
    id: "animation-philosophy",
    title: "Animation as Communication",
    date: "Jan 2026",
    content:
      "Good animation isn't decoration — it's communication. When a page flips in 3D, it tells you 'this is a book.' When a sticky note peels back, it says 'there's something underneath.' Every motion should answer a question the user didn't know they were asking.",
    inkColor: "#34495e",
  },
  {
    id: "learning-in-public",
    title: "On Learning in Public",
    date: "Dec 2025",
    content:
      "The best way to learn is to teach. Writing about what I'm learning forces me to understand it deeply enough to explain it simply. This blog is my lab notebook — messy, honest, and full of crossed-out mistakes that led somewhere interesting.",
    inkColor: "#2c3e50",
  },
  {
    id: "craft-of-code",
    title: "The Craft of Clean Code",
    date: "Nov 2025",
    content:
      "Code is read far more often than it's written. I treat every function like a sentence: it should be clear, concise, and do one thing well. The best code reads like well-written prose — you understand the intent before you understand the implementation.",
    inkColor: "#4a4a4a",
  },
]
