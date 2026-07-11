// ─────────────────────────────────────────────────────────────────────────────
// Human-facing descriptions of the 11 built-in traversal modes, plus a forkable
// step-list APPROXIMATION of each one's choreography.
//
// These are AUTHORING AIDS for the admin only (nothing in src/notebook imports
// this file). `gates` restates, in plain English, when travel()'s geometry pools
// would include the mode; `template` is a hand-authored Step[] that a custom
// action can be forked from — a close-enough sketch of the real poses / sfx /
// timing rhythm, NOT the tuned original. The real, hand-tuned choreographies live
// in Notebook.tsx (vaultTo / swingTo / comboTo / …) and are left untouched.
//
// Every template MUST compile clean through compileAction (verified by the
// admin gate + the fork flow). Templates end at (or near) the anchor and let the
// compiler's shared epilogue supply the final land + finish, exactly as the
// built-ins share one land→+540ms→idle tail.
// ─────────────────────────────────────────────────────────────────────────────
import type { BuiltinMode, Step } from './docTypes'

export interface BuiltinInfo {
  label: string
  blurb: string
  gates: string
  template: Step[]
}

export const BUILTIN_INFO: Record<BuiltinMode, BuiltinInfo> = {
  walk: {
    label: 'Walk',
    blurb: 'Just… walks there. Occasionally trips over nothing and recovers with dignity.',
    gates: 'level ground, close-to-mid range (horiz ≤ 430)',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'to', side: 'near' }, speed: 190, pose: 'walk', ease: 'linear', easeY: 'linear' },
      { do: 'pose', pose: 'trip', ms: 200 },
      { do: 'say', text: 'whoa—', holdMs: 520 },
      { do: 'move', to: { at: 'anchor' }, speed: 190, pose: 'walk', ease: 'linear', easeY: 'linear' },
    ],
  },
  hop: {
    label: 'Hop',
    blurb: 'A quick coiled leap. Short, springy, over before you can blink.',
    gates: 'short level hops, or up/down climbs & drops (vert > 110)',
    template: [
      { do: 'pose', pose: 'tuck', ms: 180 },
      { do: 'sfx', kind: 'hop' },
      { do: 'move', to: { at: 'anchor' }, ms: 920, pose: 'tuck', arc: 'hop', ease: 'launch' },
      { do: 'fx', kind: 'shake' },
    ],
  },
  roll: {
    label: 'Roll',
    blurb: 'Tucks into a ball and glides across. Low, fast, faintly reckless.',
    gates: 'close level range, or a tumbling descent (vert > 110 down)',
    template: [
      { do: 'sfx', kind: 'hop' },
      { do: 'pose', pose: 'tuck', ms: 0 },
      { do: 'move', to: { at: 'anchor' }, speed: 300, pose: 'tuck', ease: 'glide', easeY: 'glide' },
    ],
  },
  poof: {
    label: 'Poof',
    blurb: 'Vanishes in a puff of smoke and reappears elsewhere. Distance is not its problem.',
    gates: 'long hauls (horiz > 430) or any steep climb/drop — teleports, so range is no object',
    template: [
      { do: 'sfx', kind: 'flip' },
      { do: 'fx', kind: 'smoke' },
      { do: 'pose', pose: 'hidden', ms: 370 },
      { do: 'move', to: { at: 'anchor' }, ms: 0, pose: 'land' },
      { do: 'fx', kind: 'smoke' },
      { do: 'sfx', kind: 'flip' },
    ],
  },
  vault: {
    label: 'Vault',
    blurb: 'Runs to the ledge, peeks over, then whoosh — plants a hand and vaults across.',
    gates: 'level ground at any horizontal range (vert ≤ 110)',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'near', inset: 6 }, speed: 270, pose: 'walk' },
      { do: 'pose', pose: 'peek', ms: 760 },
      { do: 'move', to: { at: 'anchor' }, ms: 500, pose: 'vault', arc: 'vault', ease: 'hopfall', sfx: 'whoosh' },
      { do: 'fx', kind: 'shake' },
    ],
  },
  rope: {
    label: 'Rope',
    blurb: 'Runs to the edge and goes hand-over-hand across a slack line. Deliberate, unhurried.',
    gates: 'level ground, mid-to-long range (horiz > 250)',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'far', inset: 8 }, speed: 270, pose: 'walk', ease: 'linear', easeY: 'linear' },
      { do: 'cam', on: 'midpoint', mult: 1.22, fast: false },
      { do: 'move', to: { at: 'anchor' }, speed: 115, pose: 'rope', ease: 'linear', easeY: 'linear', sfx: 'hop' },
      { do: 'camClear' },
    ],
  },
  swing: {
    label: 'Swing',
    blurb: 'Coils, leaps to a bar overhead, swings once, and lets go into the landing.',
    gates: 'mid-to-long range, or steep climbs & drops — the everywhere mover',
    template: [
      { do: 'pose', pose: 'tuck', ms: 180 },
      { do: 'sfx', kind: 'hop' },
      { do: 'move', to: { at: 'panelEdge', panel: 'to', side: 'near', dy: -120 }, ms: 620, pose: 'tuck', arc: 'hop', ease: 'launch', sfx: 'whoosh' },
      { do: 'pose', pose: 'swing', ms: 640 },
      { do: 'move', to: { at: 'anchor' }, ms: 540, pose: 'tuck', ease: 'glide', sfx: 'hop' },
    ],
  },
  wallrun: {
    label: 'Wall-run',
    blurb: 'Sprints at the wall and runs UP it, then kicks off into the landing above.',
    gates: 'steep climbs only (vert > 110 up)',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'to', side: 'near' }, speed: 290, pose: 'walk', ease: 'linear', easeY: 'linear' },
      { do: 'sfx', kind: 'whoosh' },
      { do: 'move', to: { at: 'panelEdge', panel: 'to', side: 'near', dy: -70 }, speed: 330, pose: 'wallrun', ease: 'glide' },
      { do: 'move', to: { at: 'anchor' }, ms: 450, pose: 'tuck', arc: 'hop', ease: 'launch', sfx: 'hop' },
    ],
  },
  slide: {
    label: 'Slide',
    blurb: 'Runs off the ledge and skids down the face, then hops to a stop at the bottom.',
    gates: 'steep descents only (vert > 110 down)',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'far' }, speed: 290, pose: 'walk', ease: 'linear', easeY: 'linear' },
      { do: 'sfx', kind: 'scrape' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'far', dy: 120 }, speed: 380, pose: 'slide', ease: 'snap' },
      { do: 'move', to: { at: 'anchor' }, ms: 500, pose: 'tuck', arc: 'hop', ease: 'launch', sfx: 'hop' },
    ],
  },
  smash: {
    label: 'Smash',
    blurb: 'Winds up a punch at the border, cracks it open, and struts through the hole.',
    gates: 'level ground, close-to-mid range (horiz ≤ 430)',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'far', inset: 0 }, speed: 260, pose: 'walk', ease: 'linear', easeY: 'linear' },
      { do: 'pose', pose: 'punch', ms: 300 },
      { do: 'sfx', kind: 'crack' },
      { do: 'fx', kind: 'crack' },
      { do: 'move', to: { at: 'anchor' }, speed: 220, pose: 'walk', ease: 'linear', easeY: 'linear', sfx: 'scrib' },
    ],
  },
  combo: {
    label: 'Combo',
    blurb: 'The showoff: wall-run up, rope across the top, then a diving hop down. Rare and loud.',
    gates: 'long diagonal hauls (dist > 380, horiz > 240, vert > 60) — a rare 18% flourish',
    template: [
      { do: 'sfx', kind: 'scrib' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'left' }, speed: 300, pose: 'walk', ease: 'linear', easeY: 'linear' },
      { do: 'sfx', kind: 'whoosh' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'top' }, speed: 300, pose: 'wallrun', ease: 'glide' },
      { do: 'move', to: { at: 'panelEdge', panel: 'from', side: 'right' }, speed: 130, pose: 'rope', ease: 'linear' },
      { do: 'move', to: { at: 'anchor' }, ms: 620, pose: 'tuck', arc: 'hop', ease: 'launch', sfx: 'whoosh' },
    ],
  },
}
