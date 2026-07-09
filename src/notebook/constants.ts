// ─────────────────────────────────────────────────────────────────────────────
// Ported verbatim from the source dc_script.js. Do NOT tweak any value: the
// panel geometry, word lists and animation-arc maps are load-bearing for the
// exact timings/choreography the controller replays.
// ─────────────────────────────────────────────────────────────────────────────
import type { PageGeom } from './types'

export const PAGES: PageGeom[] = [
  { name: 'COVER', panels: [] },
  { name: 'INTRO', panels: [
    { x: 60, y: 90, w: 480, h: 300, ax: 300, ay: 90 },
    { x: 580, y: 120, w: 280, h: 240, ax: 720, ay: 120 },
    { x: 200, y: 430, w: 520, h: 170, ax: 460, ay: 430 }
  ]},
  { name: 'ABOUT', panels: [
    { x: 70, y: 80, w: 500, h: 340, ax: 205, ay: 409, pose: 'fight', face: -1 },
    { x: 610, y: 150, w: 250, h: 280, ax: 735, ay: 150 }
  ]},
  { name: 'WORK', panels: [
    { x: 60, y: 80, w: 390, h: 280, ax: 255, ay: 80 },
    { x: 480, y: 120, w: 380, h: 280, ax: 670, ay: 120 },
    { x: 170, y: 440, w: 560, h: 160, ax: 450, ay: 440, pose: 'think' }
  ]},
  { name: 'SKILLS', panels: [
    { x: 70, y: 90, w: 520, h: 330, ax: 165, ay: 412, pose: 'spray' },
    { x: 630, y: 140, w: 230, h: 260, ax: 745, ay: 140 }
  ]},
  { name: 'CONTACT', panels: [
    { x: 90, y: 90, w: 480, h: 300, ax: 330, ay: 90 },
    { x: 610, y: 130, w: 250, h: 240, ax: 735, ay: 130 }
  ]}
]

export const POKE: string[] = ['oof!', 'hey!', 'careful!', 'boing.', 'do that again!', '10/10 poke.', 'rude.', 'tickles.', 'my spleen!', 'again again!']
export const CHATTER: string[] = ['just... standing here.', 'nice cursor.', 'try dragging me sometime.', 'is it lunch yet?', 'I do my own stunts.', 'psst. try the auto button.', 'still here. still heroic.']
export const DROPS: string[] = ['wheee!', 'I meant to do that.', 'gravity. classic.', 'sturdy landing. nailed it.', 'a perfect 10.']

export type ArcKey = 'hop' | 'spin' | 'wob'

export const POKEARC: Record<ArcKey, string> = {
  hop: 'transform-origin:50% 92%; animation:pokehop .5s cubic-bezier(.4,.1,.3,1)',
  spin: 'transform-origin:50% 55%; animation:spin360 .55s cubic-bezier(.5,.1,.4,1)',
  wob: 'transform-origin:50% 92%; animation:pokewob .65s ease-in-out'
}
export const FIDGETARC: Record<ArcKey, string> = {
  hop: 'transform-origin:50% 92%; animation:fidgethop .7s cubic-bezier(.4,.1,.3,1)',
  spin: 'transform-origin:50% 55%; animation:spin360 .6s cubic-bezier(.5,.1,.4,1)',
  wob: 'transform-origin:50% 92%; animation:pokewob .7s ease-in-out'
}
export const SNARK: string[] = [
  'click it. I dare you.',
  'oh no. he made a website.',
  "the sword is foam. don't tell him.",
  'I "helped" with all of these.',
  'the paint is non-toxic. probably.',
  'hire him so he stops rolling indoors.'
]
