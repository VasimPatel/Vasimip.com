import type { Content } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// EDIT-HERE FILE. All personal / portfolio copy lives here.
//
// ✅ Confirmed: name (Vasim Patel), email (vasimip@gmail.com).
// ⚠️ DRAFTS — please review & replace: city, the two projects, the skills list,
//    the bio line, and the fun facts. They're written in the comic's voice but
//    the specifics are placeholders until you confirm them.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTENT: Content = {
  cover: {
    name: 'Vasim Patel (portfolio dept.)',
    subject: 'the adventures of vasim patel',
  },
  intro: {
    titlePre: 'THE ADVENTURES OF',
    name: 'VASIM PATEL',
    subtitle: 'a portfolio told in ink, marker & questionable stunts',
    issue: 'issue #01 · self-published · priceless',
    starringDash: 'DASH — does the stunts.',
    starringPip: 'PIP — does the judging.',
  },
  about: {
    // ⚠️ DRAFT bio — swap for the real thing.
    bio: 'Builds things for the web. Draws in the margins. Jumps off the occasional deadline (professionally). Currently accepting quests — freelance or full-time. Weakness: unclosed browser tabs.',
    city: 'the internet', // ⚠️ DRAFT — replace with your real city.
    funFacts: [
      // ⚠️ DRAFT fun facts.
      'ships fast, refactors faster',
      'has strong opinions about spacing',
      'the cape is one CSS gradient, load-bearing',
      'narrates his own commit messages',
    ],
  },
  work: {
    // ⚠️ DRAFT projects — replace titles + blurbs with your real work.
    projects: [
      {
        title: 'PROJECT ONE: THE BIG THING',
        blurb: 'shipped. exploded (the good way). role: everything, allegedly.',
      },
      {
        title: 'PROJECT TWO: THE OTHER THING',
        blurb: 'award-adjacent. the judges said "hm!" — a review.',
      },
    ],
    vaultNote:
      "More work exists. It's in a drawer. Ask about the drawer. (Replace these with your real projects — Dash will guard them.)",
  },
  skills: {
    // ⚠️ DRAFT skills — the last one is a joke; keep or replace.
    skills: ['DESIGN & UX', 'FRONT-END', 'PROTOTYPING', 'SNACK LOGISTICS'],
    toolbelt: ['the keyboard', 'the back button', 'content applicator'],
  },
  contact: {
    email: 'vasimip@gmail.com',
    responseLine: 'responds within 1–2 business rolls.',
    theEndNote: 'sequel pending funding.',
  },
}
