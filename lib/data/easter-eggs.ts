export interface EasterEggDef {
  id: string
  name: string
  hint: string
  page: string
}

export const EASTER_EGGS: EasterEggDef[] = [
  {
    id: "scratch-reveal",
    name: "Secret Project",
    hint: "Scratch the mystery card on the Projects page",
    page: "projects",
  },
  {
    id: "invisible-ink",
    name: "Hidden Message",
    hint: "Select text on the Blog page to reveal invisible ink",
    page: "blog",
  },
  {
    id: "tic-tac-toe",
    name: "Margin Game",
    hint: "Play tic-tac-toe in the Resume page margin",
    page: "resume",
  },
  {
    id: "sticky-note",
    name: "Sticky Secret",
    hint: "Peel the sticky note on the About page",
    page: "about",
  },
]
