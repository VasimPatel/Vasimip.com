export interface PageDefinition {
  id: string
  title: string
  tabColor: string
  tabLabel: string
}

export const PAGES: PageDefinition[] = [
  { id: "cover", title: "Cover", tabColor: "#1a1a1a", tabLabel: "Cover" },
  { id: "about", title: "About Me", tabColor: "#e74c3c", tabLabel: "About" },
  { id: "projects", title: "Projects", tabColor: "#3498db", tabLabel: "Projects" },
  { id: "blog", title: "Blog", tabColor: "#2ecc71", tabLabel: "Blog" },
  { id: "resume", title: "Resume", tabColor: "#f39c12", tabLabel: "Resume" },
  { id: "contact", title: "Contact", tabColor: "#9b59b6", tabLabel: "Contact" },
]

export const PAGE_HASH_MAP: Record<string, number> = {
  "#cover": 0,
  "#about": 1,
  "#projects": 2,
  "#blog": 3,
  "#resume": 4,
  "#contact": 5,
}
