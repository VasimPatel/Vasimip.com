export interface Passage {
  id: string
  threshold?: string
  depthRange: [number, number]
  lampRadius: number
  particleDensity: number
}

export const PASSAGES: Passage[] = [
  {
    id: "surface",
    depthRange: [0, 100],
    lampRadius: 520,
    particleDensity: 0.1,
  },
  {
    id: "first-room",
    threshold: "Deeper, then.",
    depthRange: [100, 300],
    lampRadius: 490,
    particleDensity: 0.25,
  },
  {
    id: "the-craft",
    threshold: "You stayed.",
    depthRange: [300, 500],
    lampRadius: 460,
    particleDensity: 0.4,
  },
  {
    id: "the-work",
    threshold: "This is where it gets interesting.",
    depthRange: [500, 700],
    lampRadius: 430,
    particleDensity: 0.55,
  },
  {
    id: "the-depth",
    threshold: "Almost there.",
    depthRange: [700, 900],
    lampRadius: 410,
    particleDensity: 0.7,
  },
  {
    id: "the-ember",
    threshold: "You found it.",
    depthRange: [900, 1100],
    lampRadius: 390,
    particleDensity: 0.85,
  },
]

export function getPassageForDepth(vhDepth: number): Passage {
  for (let i = PASSAGES.length - 1; i >= 0; i--) {
    if (vhDepth >= PASSAGES[i].depthRange[0]) {
      return PASSAGES[i]
    }
  }
  return PASSAGES[0]
}
