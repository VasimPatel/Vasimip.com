/**
 * The codex's words — FICTION. This is an invented record of a descent through a
 * buried, drowned world; none of it refers to any real person, place, or work.
 * Edit freely. The structure (lead / paragraphs / marginalia / hidden asides /
 * links) is what the reveal and the page geometry expect.
 *
 * `aside` blocks are the hidden illuminations — tucked in the margins, revealed
 * only by a torch that lingers, and remembered once found.
 */
import type { DepthId } from '@/lib/depths'

export type Block =
  | { kind: 'lead'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'margin'; text: string }
  | { kind: 'aside'; id: string; text: string }
  | { kind: 'link'; text: string; href: string; label?: string }

export interface DepthContent {
  id: DepthId
  epigraph?: string
  blocks: Block[]
}

export const CONTENT: Record<DepthId, DepthContent> = {
  threshold: {
    id: 'threshold',
    epigraph: 'Here there is almost no light.',
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
  },

  works: {
    id: 'works',
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
  },

  frontier: {
    id: 'frontier',
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
  },

  hearth: {
    id: 'hearth',
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
  },

  arrival: {
    id: 'arrival',
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
  },
}
