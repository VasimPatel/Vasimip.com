// ─────────────────────────────────────────────────────────────────────────────
// Shared contract for the Dash notebook. Both the controller (Notebook.tsx) and
// the artwork components (Dash / poses / pages / effects / Hud) code against this.
// ─────────────────────────────────────────────────────────────────────────────

/** Every named Dash pose. 'hidden' and 'dive' render no skeleton (Dash is mid-flight). */
export type Pose =
  | 'hidden'
  | 'idle'
  | 'walk'
  | 'tuck'
  | 'land'
  | 'fight'
  | 'spray'
  | 'dangle'
  | 'throw'
  | 'wave'
  | 'cheer'
  | 'trip'
  | 'think'
  | 'sneeze'
  | 'vault'
  | 'wallrun'
  | 'rope'
  | 'swing'
  | 'slide'
  | 'surf'
  | 'shove'
  | 'punch'
  | 'peek'
  | 'hang'
  | 'knock'
  | 'dive'

/** A comic panel's geometry within the 920×660 page world (from the source PAGES const). */
export interface PanelGeom {
  x: number
  y: number
  w: number
  h: number
  /** Dash's anchor point when standing at this panel. */
  ax: number
  ay: number
  /** A pose Dash strikes on arrival at this panel, if any. */
  pose?: Extract<Pose, 'fight' | 'think' | 'spray'>
  /** Facing direction to force on arrival (+1 right, -1 left). */
  face?: 1 | -1
}

export interface PageGeom {
  name: string
  panels: PanelGeom[]
}

// ── Head-tracking props (only idle & spray consume these) ────────────────────
export interface HeadTrack {
  /** degrees, head rotate */
  headTilt: number
  /** px, pupil offset x (already multiplied by face) */
  lookXf: number
  /** px, pupil offset y */
  lookY: number
  /** pupil radius */
  eyeR: number
}

export interface DashProps extends HeadTrack {
  pose: Pose
  /** e.g. `scaleX(1) rotate(3deg)` — facing + lean, applied to the whole figure. */
  faceTf: string
}

// ── HUD ──────────────────────────────────────────────────────────────────────
export interface HudTab {
  name: string
  active: boolean
  go: () => void
}

export interface HudProps {
  tabs: HudTab[]
  onPrev: () => void
  onNext: () => void
  onAuto: () => void
  onSound: () => void
  autoLabel: string
  soundLabel: string
  pageLabel: string
}

// ── Leaf-component props (controller computes the values, passes them down) ───
import type { CSSProperties } from 'react'

/** Positioned overlay effects (Smoke, Bomb, Boom, Crack, Hole, FocusRing).
 *  The component owns its fixed width/height/z-index/pointer-events; `style`
 *  carries the per-frame position (left/top) the controller computed. */
export interface EffectProps {
  style: CSSProperties
}

export interface ReactBubbleProps {
  style: CSSProperties
  text: string
}

export interface PipSnarkProps {
  text: string
}

/** A notebook page's flip wrapper. `style` carries transform + z-index. */
export interface PageProps {
  style: CSSProperties
}

export interface CoverProps extends PageProps {
  onOpen: () => void
}

/** The Skills page's swipe reveal only plays once Dash has sprayed the panel. */
export interface SkillsProps extends PageProps {
  skillsOn: boolean
}

// ── Editable, user-facing copy. Everything personal lives here (see content.ts).
// Purely-decorative UI text (how-to-read hints, tab names, control labels) stays
// inline in the artwork — it is not part of the portfolio's content.
export interface Content {
  cover: { name: string; subject: string }
  intro: {
    titlePre: string
    name: string
    subtitle: string
    issue: string
    starringDash: string
    starringPip: string
  }
  about: { bio: string; city: string; funFacts: string[] }
  work: {
    projects: { title: string; blurb: string }[]
    vaultNote: string
  }
  skills: { skills: string[]; toolbelt: string[] }
  contact: { email: string; responseLine: string; theEndNote: string }
}
