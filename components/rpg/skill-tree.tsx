"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SKILLS } from "@/lib/data/skills"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface SkillNode {
  id: string
  name: string
  level: number
  category: string
  x: number
  y: number
  connections: string[]
}

function buildSkillNodes(): SkillNode[] {
  const categoryPositions: Record<string, { startX: number; y: number }> = {
    frontend: { startX: 50, y: 60 },
    backend: { startX: 50, y: 180 },
    tools: { startX: 50, y: 300 },
  }

  const nodes: SkillNode[] = []
  const grouped: Record<string, typeof SKILLS> = {}

  for (const skill of SKILLS) {
    if (!grouped[skill.category]) grouped[skill.category] = []
    grouped[skill.category].push(skill)
  }

  for (const [category, skills] of Object.entries(grouped)) {
    const pos = categoryPositions[category]
    skills.forEach((skill, i) => {
      const x = pos.startX + i * 120
      const y = pos.y
      const connections: string[] = []
      if (i > 0) connections.push(skills[i - 1].name)
      nodes.push({ id: skill.name, name: skill.name, level: skill.level, category, x, y, connections })
    })
  }

  return nodes
}

const categoryColors: Record<string, string> = {
  frontend: "var(--comic-red)",
  backend: "var(--comic-blue)",
  tools: "var(--comic-green)",
}

export function SkillTree({ className }: { className?: string }) {
  const nodes = buildSkillNodes()
  const reducedMotion = useReducedMotion()

  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <svg viewBox="0 0 550 380" className="w-full min-w-[500px]">
        {/* Connection lines */}
        {nodes.map((node) =>
          node.connections.map((connId) => {
            const target = nodes.find((n) => n.id === connId)
            if (!target) return null
            return (
              <motion.line
                key={`${node.id}-${connId}`}
                x1={target.x}
                y1={target.y}
                x2={node.x}
                y2={node.y}
                stroke="var(--comic-ink)"
                strokeWidth={2}
                strokeDasharray="6 3"
                opacity={0.3}
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: reducedMotion ? 0 : 0.5 }}
              />
            )
          })
        )}

        {/* Category labels */}
        {[
          { label: "FRONTEND", y: 30, color: "var(--comic-red)" },
          { label: "BACKEND", y: 150, color: "var(--comic-blue)" },
          { label: "TOOLS", y: 270, color: "var(--comic-green)" },
        ].map((cat) => (
          <text
            key={cat.label}
            x={10}
            y={cat.y}
            fill={cat.color}
            fontSize={10}
            fontFamily="var(--font-press-start)"
            opacity={0.7}
          >
            {cat.label}
          </text>
        ))}

        {/* Skill nodes */}
        {nodes.map((node, i) => (
          <motion.g
            key={node.id}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0 }}
            whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: reducedMotion ? 0.15 : 0.3 }}
          >
            {/* Node circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r={20 + (node.level / 100) * 8}
              fill="var(--comic-panel)"
              stroke={categoryColors[node.category]}
              strokeWidth={3}
            />
            {/* Fill based on level */}
            <circle
              cx={node.x}
              cy={node.y}
              r={(20 + (node.level / 100) * 8) - 4}
              fill={categoryColors[node.category]}
              opacity={node.level / 150}
            />
            {/* Level text */}
            <text
              x={node.x}
              y={node.y + 3}
              textAnchor="middle"
              fill="var(--comic-ink)"
              fontSize={9}
              fontFamily="var(--font-press-start)"
            >
              {node.level}
            </text>
            {/* Name below */}
            <text
              x={node.x}
              y={node.y + 38}
              textAnchor="middle"
              fill="var(--comic-ink)"
              fontSize={7}
              fontFamily="var(--font-press-start)"
              opacity={0.8}
            >
              {node.name.split(" / ")[0]}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  )
}
