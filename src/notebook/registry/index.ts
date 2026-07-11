import type { ComponentType } from 'react'
import BirdFin from './BirdFin'
import FightScene from './FightScene'
import HowToRead from './HowToRead'
import PipFigure from './PipFigure'
import Placeholder from './Placeholder'
import SkillsReveal from './SkillsReveal'
import Toolbelt from './Toolbelt'

export const REGISTRY: Record<string, ComponentType<{ props?: Record<string, unknown> }>> = {
  fightScene: FightScene,
  skillsReveal: SkillsReveal,
  toolbelt: Toolbelt,
  pipFigure: PipFigure,
  birdFin: BirdFin,
  howToRead: HowToRead,
  placeholder: Placeholder,
}
