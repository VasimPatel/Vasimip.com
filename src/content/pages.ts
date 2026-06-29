/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  THE PAGES — the one file you edit to author the codex.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Each of the five pages (depths) is one entry in `PAGES`, and bundles THREE
 * things in one place:
 *
 *   1. the heading   — roman numeral, title, the short kicker beside it
 *   2. the words     — epigraph + blocks (lead / paragraphs / margin / aside)
 *   3. the look      — a `theme`: which colours and what ink style this page uses
 *
 * COLOURS ARE MAPPABLE. Anywhere a colour is asked for you may write either a
 * NAMED palette token (e.g. 'verdigris', 'amber', 'parchment') or a raw hex
 * string (e.g. '#C6CCB6'). The named tokens live in `src/lib/palette.ts` — add
 * your own there and reference them here. `resolveColor` turns a token into hex.
 *
 * This file is the single source of truth: `CONTENT` (the prose),
 * `DEPTH_DEFS` (titles + scene mood) and `INK_CONFIG` (the living-ink shader)
 * are all DERIVED from it, so editing here changes everything in step.
 *
 * It is fiction — an invented drowned/buried world, no real person or place.
 * Edit the words freely.
 */
import { PALETTE, type ColorName } from '@/lib/palette'
import type { DepthId } from '@/lib/depths'

// ── the words ───────────────────────────────────────────────────────────────
/** A block of prose. `lead` is the big opener; `p` a paragraph; `margin` a small
 *  marginal note; `aside` a hidden illumination (revealed only by a lingering
 *  torch, and remembered once found); `link` an outbound link. */
export type Block =
  | { kind: 'lead'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'margin'; text: string }
  | { kind: 'aside'; id: string; text: string }
  | { kind: 'link'; text: string; href: string; label?: string }

// ── colours ───────────────────────────────────────────────────────────────--
/** A colour: a named palette token (autocompletes) OR any hex/CSS string. */
export type ColorToken = ColorName | (string & {})

/** Token → hex. A palette name resolves to its hex; anything else passes through. */
export function resolveColor(token: ColorToken): string {
  return token in PALETTE ? PALETTE[token as ColorName] : token
}

// ── the look ──────────────────────────────────────────────────────────────--
/** The colour + style of one page: the ink it's drawn in, the substrate it sits
 *  on, how the ink moves, and the scene mood (ambient light + fog) around it. */
export interface PageTheme {
  /** the ink's accent colour — token or hex */
  ink: ColorToken
  /** the lit substrate the ink dances on — token or hex (warm up top, cool deep) */
  substrate: ColorToken
  /** ink drift direction [x, y] (e.g. [0,-0.45] rises, [0.5,0] flows right) */
  flow: [number, number]
  /** how restless the ink dance is (≈0.4 calm … ≈1.2 turbulent) */
  energy: number
  /** spatial size of the ink forms (smaller = larger forms) */
  scale: number
  /** how dark/dense the ink gets, 0..1 */
  density: number

  /** ambient floor 0..1 — how lit the scene is BEFORE the torch (dark→light arc) */
  ambient: number
  /** the colour the ambient/hemisphere sits at (token) */
  ambientColor: ColorName
  /** fog density — thick & close early, clear at the bottom */
  fog: number
  /** fog colour (token) */
  fogColor: ColorName
  /** the cold END of the torch's distance ramp (token; verdigris in cold depths) */
  rampCold: ColorName
  /** a faint, near-imperceptible scene tilt for strangeness (radians, optional) */
  tilt?: number
}

/** One page of the codex: heading + words + look. */
export interface PageConfig {
  /** the chapter numeral, e.g. 'I' */
  roman: string
  /** the blackletter chapter title */
  title: string
  /** the short kicker shown beside the numeral */
  facet: string
  /** spacing of the plunge INTO this page, × the base gap (default 1) */
  gapScale?: number

  /** the italic line under the title */
  epigraph?: string
  /** the prose, in order */
  blocks: Block[]

  /** the colour + ink style for this page */
  theme: PageTheme
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE FIVE PAGES.  Reorder/add/remove the id list in `src/lib/depths.ts`.
// ─────────────────────────────────────────────────────────────────────────────
export const PAGES: Record<DepthId, PageConfig> = {
  threshold: {
    roman: 'I',
    title: 'Hi',
    facet: 'I Am Vasim',
    gapScale: 1,
    epigraph: 'Are you ready to hear a tale?',
    blocks: [
      { kind: 'lead', text: 'You have found a book that is read by its own light.' },
      {
        kind: 'p',
        text: 'It does not open on a desk in the sun. It keeps to the dark, and asks something of you first: a hand, a little patience, and the willingness to carry the flame yourself.',
      },
      {
        kind: 'p',
        text: 'Move, and the page answers. Where the torch falls, ink rises out of the vellum — letters, figures, the small gilt marks left in the margins for whoever is thorough enough to look. Where it does not fall, the dark keeps its counsel.',
      },
      { kind: 'margin', text: 'Take up the torch. Then go down.' },
      {
        kind: 'aside',
        id: 'threshold-first-ember',
        text: 'An ember, banked low, that remembers you came this way.',
      },
    ],
    theme: {
      ink: 'amber',
      substrate: 'vellum',
      flow: [0.0, -0.45],
      energy: 0.5,
      scale: 2.5,
      density: 0.72,
      ambient: 0.02,
      ambientColor: 'ink',
      fog: 0.085,
      fogColor: 'ink',
      rampCold: 'ink',
    },
  },

  works: {
    roman: 'II',
    title: 'The Drowned Archive',
    facet: 'what the water kept',
    gapScale: 1.5, // the flooded stacks read tall
    epigraph: 'A library, and the water that took it.',
    blocks: [
      { kind: 'lead', text: 'Below the threshold the stairs give way to shelves.' },
      {
        kind: 'p',
        text: 'This was an archive once, before the water rose through it — ten thousand volumes shelved by a people no longer here to be asked their names. The bindings have swollen, the ink has run, and still the catalogue holds: each book a faint cold light in the dark, waiting to be read off the stacks region by region as the torch sweeps across them.',
      },
      {
        kind: 'p',
        text: 'Most of what was written here is lost. What survives, survives the way a constellation does — not the thing itself, only the pattern of where it once burned.',
      },
      { kind: 'margin', text: 'Strata of stone and water. Sweep the light to read the stacks.' },
      {
        kind: 'aside',
        id: 'works-quiet-shelf',
        text: 'The quietest shelf, at the back, holds the book that explains all the others. No one has reached it.',
      },
    ],
    theme: {
      ink: 'verdigris',
      substrate: 'parchment',
      flow: [0.5, -0.08],
      energy: 0.7,
      scale: 3.0,
      density: 0.86,
      ambient: 0.08,
      ambientColor: 'abyss',
      fog: 0.055,
      fogColor: 'abyss',
      rampCold: 'verdigris',
    },
  },

  frontier: {
    roman: 'III',
    title: 'The Verdigris Menagerie',
    facet: 'specimens',
    gapScale: 1.15,
    epigraph: 'Specimens, kept in the cold.',
    blocks: [
      { kind: 'lead', text: 'The coldest room in the book is the one that breathes.' },
      {
        kind: 'p',
        text: 'Behind glass gone green with age stand the specimens — things that should not keep, kept anyway: a moth the size of a hand, a key that fits no lock found since, a jar of weather from a year with no name. Each is lit only by what you bring to it, and each carries a line of marginalia for the curious, in a hand that did not expect to be read.',
      },
      {
        kind: 'p',
        text: 'Nothing here is explained. That is the purpose of a menagerie kept this deep — to hold the questions open a little longer, where the cold will not let them spoil.',
      },
      { kind: 'margin', text: 'Verdigris on every hinge. Do not tap the glass.' },
      {
        kind: 'aside',
        id: 'frontier-thirteenth-jar',
        text: 'The thirteenth jar is empty, and labelled in a hand that matches your own.',
      },
    ],
    theme: {
      ink: 'verdigris',
      substrate: 'parchmentCold',
      flow: [-0.26, 0.12],
      energy: 0.98,
      scale: 3.6,
      density: 0.9,
      ambient: 0.06,
      ambientColor: 'abyss',
      fog: 0.06,
      fogColor: 'ink',
      rampCold: 'verdigris', // the coldest, strangest point of the descent
      tilt: 0.012,
    },
  },

  hearth: {
    roman: 'IV',
    title: 'The Ember Court',
    facet: 'the fire',
    gapScale: 1.1,
    epigraph: 'After the cold, a fire.',
    blocks: [
      { kind: 'lead', text: 'Then, without warning, it is warm.' },
      {
        kind: 'p',
        text: 'There is a hall down here the water never reached, and a fire in it no one remembers lighting. Around the hearth the chairs are drawn close, as though a company had only just stood and stepped out of the light. The marks on the table are recent. The wine is not yet cold.',
      },
      {
        kind: 'p',
        text: 'This is the part of the book that does not need to be grand. The dark here is not the mystery of the archive or the menagerie; it is only the ordinary dark of a room you might have been welcome in, with the fire low and someone, somewhere, still awake.',
      },
      { kind: 'margin', text: 'Sit. The fire is for you as much as for anyone.' },
      {
        kind: 'aside',
        id: 'hearth-empty-chair',
        text: 'One chair is left empty on purpose. It is not clear whose.',
      },
    ],
    theme: {
      ink: 'ember',
      substrate: 'vellumWarm',
      flow: [0.0, -0.85],
      energy: 1.2,
      scale: 2.4,
      density: 0.85,
      ambient: 0.2, // the decisive warm turn
      ambientColor: 'ember',
      fog: 0.045,
      fogColor: 'ember',
      rampCold: 'ink',
    },
  },

  arrival: {
    roman: 'V',
    title: 'The Last Leaf',
    facet: 'the close',
    gapScale: 1.1,
    epigraph: 'The bottom, and the close.',
    blocks: [
      { kind: 'lead', text: 'You have reached the last page, and it is finally, fully lit.' },
      {
        kind: 'p',
        text: 'The torch has done its work; you can set it down. The book gathers what you found on the way down — the embers you kindled, the margins you lingered in — and shows it back to you, the way a record speaks of the one who read it.',
      },
      {
        kind: 'p',
        text: 'There is nothing beneath this leaf. Whoever made the codex left it unsigned, and left this page nearly blank, as if to say: the rest is for the next hand to carry the flame.',
      },
      {
        kind: 'aside',
        id: 'arrival-colophon',
        text: 'A colophon, in the gutter: "Written by no one, for whoever descends."',
      },
      { kind: 'margin', text: 'You have read the codex. Close it gently.' },
    ],
    theme: {
      ink: 'gilt',
      substrate: 'vellumPale',
      flow: [0.12, 0.5],
      energy: 0.42,
      scale: 3.0,
      density: 0.7,
      ambient: 0.5, // the page finally fully lit; the torch's job is done
      ambientColor: 'vellum',
      fog: 0.02,
      fogColor: 'abyss',
      rampCold: 'ink',
    },
  },
}
