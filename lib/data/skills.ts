export interface Skill {
  name: string
  level: number // 0-100
  category: "frontend" | "backend" | "tools"
}

export const SKILLS: Skill[] = [
  { name: "React / Next.js", level: 95, category: "frontend" },
  { name: "TypeScript", level: 90, category: "frontend" },
  { name: "CSS / Tailwind", level: 92, category: "frontend" },
  { name: "Animation / Motion", level: 85, category: "frontend" },
  { name: "Node.js", level: 82, category: "backend" },
  { name: "Python", level: 78, category: "backend" },
  { name: "SQL / Databases", level: 75, category: "backend" },
  { name: "REST / GraphQL", level: 88, category: "backend" },
  { name: "Git / GitHub", level: 90, category: "tools" },
  { name: "Figma", level: 72, category: "tools" },
  { name: "Testing", level: 80, category: "tools" },
  { name: "CI/CD", level: 70, category: "tools" },
]

export interface Experience {
  role: string
  company: string
  period: string
  highlights: string[]
}

export const EXPERIENCES: Experience[] = [
  {
    role: "Software Engineer",
    company: "Tech Company",
    period: "2023 — Present",
    highlights: [
      "Built interactive data visualization dashboards",
      "Led migration from REST to GraphQL",
      "Mentored junior developers on React best practices",
    ],
  },
  {
    role: "Frontend Developer",
    company: "Startup Inc.",
    period: "2021 — 2023",
    highlights: [
      "Designed and built component library from scratch",
      "Reduced bundle size by 40% through code splitting",
      "Implemented A/B testing framework",
    ],
  },
]

export interface Education {
  degree: string
  school: string
  year: string
  notes: string
}

export const EDUCATION: Education[] = [
  {
    degree: "B.S. Computer Science",
    school: "University",
    year: "2021",
    notes: "Focus on HCI and Software Engineering",
  },
]
