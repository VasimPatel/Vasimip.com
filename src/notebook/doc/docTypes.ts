// ─────────────────────────────────────────────────────────────────────────────
// The authoring document schema for the Dash notebook. A `NotebookDoc` fully
// describes the cover + pages + panels + content + Dash's per-panel arrival
// behaviour, plus (future) custom action choreographies and travel config.
// This file is data-only (types + the value arrays the validator checks
// against) — no runtime logic beyond a couple of `satisfies` sanity checks.
// ─────────────────────────────────────────────────────────────────────────────
import type { Pose } from '../types'
import type { SfxKind } from '../audio'

// ── JSON value (custom-component props) ───────────────────────────────────
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// ── Shared value catalogues (also used by the validator) ──────────────────
export const ARRIVAL_POSES = ['fight', 'think', 'spray', 'cheer'] as const
export type ArrivalPose = (typeof ARRIVAL_POSES)[number]

export const BOX_KINDS = ['text', 'draw', 'art'] as const
export type BoxKind = (typeof BOX_KINDS)[number]

/** Text-box font families: hand = 'Patrick Hand', marker = 'Permanent Marker', caveat = 'Caveat'. */
export const FAM_VALUES = ['hand', 'marker', 'caveat'] as const
export type FamKind = (typeof FAM_VALUES)[number]

export const BUILTIN_MODES = ['walk', 'hop', 'roll', 'poof', 'vault', 'rope', 'swing', 'wallrun', 'slide', 'smash', 'combo'] as const
export type BuiltinMode = (typeof BUILTIN_MODES)[number]

export const STEP_KINDS = ['pose', 'move', 'say', 'sfx', 'wait', 'fx', 'cam', 'camClear'] as const
export type StepKind = (typeof STEP_KINDS)[number]

export const FX_KINDS = ['shake', 'jitPage', 'pageShove', 'smoke', 'crack'] as const
export type FxKind = (typeof FX_KINDS)[number]

export const EASE_NAMES = ['linear', 'launch', 'hopfall', 'glide', 'snap'] as const
export type EaseName = (typeof EASE_NAMES)[number]

export const SFX_KINDS = ['flip', 'hop', 'boom', 'whoosh', 'scrape', 'crack', 'knock', 'scrib'] as const satisfies readonly SfxKind[]
// Exhaustiveness check: fails to typecheck if SFX_KINDS ever drifts from audio.ts's SfxKind union.
type _SfxKindsExhaustive = SfxKind extends (typeof SFX_KINDS)[number] ? true : false
const _sfxKindsExhaustive: _SfxKindsExhaustive = true
void _sfxKindsExhaustive

/** Every named Dash pose, mirrored from types.ts's `Pose` union so the two can't drift. */
export const POSES = [
  'hidden', 'idle', 'walk', 'tuck', 'land', 'fight', 'spray', 'dangle', 'throw', 'wave',
  'cheer', 'trip', 'think', 'sneeze', 'vault', 'wallrun', 'rope', 'swing', 'slide', 'surf',
  'shove', 'punch', 'peek', 'hang', 'knock', 'dive',
] as const satisfies readonly Pose[]
// Exhaustiveness check: fails to typecheck if POSES ever drifts from types.ts's Pose union.
type _PosesExhaustive = Pose extends (typeof POSES)[number] ? true : false
const _posesExhaustive: _PosesExhaustive = true
void _posesExhaustive

/** The three recurring "wobbly" border-radius sketch variants used by hand-drawn panels. */
export const SKETCH_RADII: Record<'a' | 'b' | 'c', string> = {
  a: '255px 18px 225px 18px/18px 225px 18px 255px',
  b: '18px 225px 18px 255px/255px 18px 225px 18px',
  c: '225px 18px 255px 18px/18px 255px 18px 225px',
}
export type SketchVariant = keyof typeof SKETCH_RADII

// ── Boxes ─────────────────────────────────────────────────────────────────
// A panel is a free-positioned whiteboard: every piece of content is a `BoxDoc`
// placed absolutely (x/y/w/h in panel-local px, optional rotation). Three kinds:
// text (words), draw (pen strokes), art (a locked registry component).
export interface BoxBase {
  /** Panel-local position + size, in px (top-left origin). */
  x: number
  y: number
  w: number
  h: number
  /** Degrees, applied to the box itself (independent of panel rotate). */
  rot?: number
  /** Only render this box once `state.flags[showIfFlag]` is true. */
  showIfFlag?: string
}

export interface TextBox extends BoxBase {
  kind: 'text'
  /** '\n' renders as a line break (whitespace: pre-line). */
  text: string
  fam?: FamKind
  size?: number
  color?: string
  hl?: 'yellow' | 'pink'
  /** Render inside the bordered index-card style. */
  note?: boolean
  /** Sparse per-(non-space-)char tilt in degrees; null entries render upright. */
  charRots?: (number | null)[]
}

export interface DrawBox extends BoxBase {
  kind: 'draw'
  strokeColor?: string
  strokeW?: number
  /** SVG path `d` strings, panel-local coordinates. */
  strokes: string[]
}

export interface ArtBox extends BoxBase {
  kind: 'art'
  /** Registry component name, e.g. 'fightScene'. Unknown names render a labeled dashed box. */
  component: string
  props?: Record<string, JsonValue>
}

export type BoxDoc = TextBox | DrawBox | ArtBox

// ── Arrival (Dash's behaviour on landing at a panel) ───────────────────────
export interface ArrivalDoc {
  pose?: ArrivalPose
  face?: 1 | -1
  /** Only strike the pose once per session (guards a one-shot reveal/flag). */
  once?: boolean
  /** Auto-revert to idle after this many ms. */
  revertMs?: number
  say?: string
  sfx?: SfxKind
  /** Set `state.flags[setFlag] = true` on arrival (drives `showIfFlag` elements). */
  setFlag?: string
  flourish?: boolean
}

// ── Custom-action interpreter (Part 2 / 3 of the plan) ─────────────────────
export interface ActionWhen {
  minDist?: number
  maxDist?: number
  minHoriz?: number
  minVert?: number
  vert?: 'up' | 'down'
  fromPanel?: number[]
}

export type MoveTarget =
  | { at: 'anchor'; dx?: number; dy?: number }
  | { at: 'offset'; dx: number; dy: number }
  | { at: 'panelEdge'; panel: 'from' | 'to'; side: 'near' | 'far' | 'left' | 'right' | 'top' | 'bottom'; inset?: number; dy?: number }

export type Step =
  | { do: 'pose'; pose: Pose; face?: 1 | -1 | 'dir' | '-dir'; ms?: number }
  | { do: 'move'; to: MoveTarget; ms?: number; speed?: number; ease?: EaseName; easeY?: EaseName; pose?: Pose; arc?: 'hop' | 'vault'; sfx?: SfxKind }
  | { do: 'say'; text: string; holdMs?: number }
  | { do: 'sfx'; kind: SfxKind }
  | { do: 'wait'; ms: number }
  | { do: 'fx'; kind: FxKind; dir?: 1 | -1 }
  | { do: 'cam'; on: 'dash' | 'target' | 'midpoint' | { cx: number; cy: number }; mult?: number; fast?: boolean }
  | { do: 'camClear' }

export interface ActionDoc {
  when?: ActionWhen
  /** ≤32 steps (validator-enforced). */
  steps: Step[]
}

export interface TravelConfig {
  builtins?: BuiltinMode[]
  actions?: string[]
  actionWeight?: number
}

// ── Panels / pages / cover / doc ────────────────────────────────────────────
export interface PanelDoc {
  x: number
  y: number
  w: number
  h: number
  /** Dash's anchor point when standing at this panel, as an offset from the
   *  panel's x/y origin. Dash's feet stand at (x + dx, y + dy) — relative so
   *  the anchor can never drift when the panel itself moves. */
  anchor: { dx: number; dy: number }
  arrival?: ArrivalDoc
  /** Applies as the DESTINATION panel's travel config when Dash is heading here. */
  travel?: TravelConfig
  /** Degrees. */
  rotate?: number
  sketch?: SketchVariant
  /** Editable ID tag (e.g. "P·01"), authoring metadata only — no runtime semantics. */
  pid?: string
  boxes: BoxDoc[]
}

export interface PageDoc {
  name: string
  snark: string
  travel?: TravelConfig
  /** ≥1 panel (validator-enforced). */
  panels: PanelDoc[]
  /** The sheet's BACK — the LEFT page of the NEXT spread (two-sided book).
   * Absent/empty = blank ruled paper. Panels are full PanelDocs in their own
   * 0..920 page space; spread.ts places them into stage coordinates. */
  back?: { panels: PanelDoc[] }
}

export interface CoverDoc {
  name: string
  subject: string
  snark: string
}

export interface NotebookDoc {
  version: 1
  cover: CoverDoc
  /** 1..12 pages (validator-enforced). */
  pages: PageDoc[]
  actions?: Record<string, ActionDoc>
  travel?: TravelConfig
}
