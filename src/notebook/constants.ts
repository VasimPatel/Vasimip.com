// ─────────────────────────────────────────────────────────────────────────────
// Ported verbatim from the source dc_script.js. Do NOT tweak any value: the
// word lists and animation-arc maps are load-bearing for the exact
// timings/choreography the controller replays. (Panel geometry + copy now live
// in the authoring document — see doc/docTypes.ts + notebook.json.)
// ─────────────────────────────────────────────────────────────────────────────

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
