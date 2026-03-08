export type SecretTrigger =
  | "proximity" // cursor gets close enough
  | "click" // click the marker
  | "drag" // drag to reveal
  | "break" // break a panel
  | "peel" // peel a panel corner
  | "scratch" // scratch-to-reveal
  | "sequence" // specific interaction sequence
  | "ink" // draw over a hidden area

export interface SecretDef {
  id: string
  zoneId: string
  trigger: SecretTrigger
  title: string
  storyFragment: string
  hint: string
  xpReward: number
  achievementId?: string
}

export const SECRETS: SecretDef[] = [
  // --- Title Screen (1 secret) ---
  {
    id: "hidden-signature",
    zoneId: "title",
    trigger: "click",
    title: "Creator's Mark",
    storyFragment:
      "Scratched into the corner of the title card, barely visible: a tiny signature. Every great work begins with someone deciding to leave their mark on the world.",
    hint: "Look carefully at the corners of the title screen.",
    xpReward: 25,
  },

  // --- Origin Story (3 secrets) ---
  {
    id: "origin-torn-photo",
    zoneId: "origin",
    trigger: "peel",
    title: "Torn Photograph",
    storyFragment:
      "Behind the panel, a faded photograph: a kid staring wide-eyed at a computer screen for the first time. The moment everything changed.",
    hint: "Some panels have corners that lift...",
    xpReward: 50,
    achievementId: "sticky-secret",
  },
  {
    id: "origin-first-line",
    zoneId: "origin",
    trigger: "proximity",
    title: "The First Line",
    storyFragment:
      "print('hello world') — typed at midnight, lit only by the monitor's glow. It compiled on the first try. Nothing has been that easy since.",
    hint: "Hover near the beginning of the story.",
    xpReward: 30,
  },
  {
    id: "origin-broken-panel",
    zoneId: "origin",
    trigger: "break",
    title: "Shattered Expectations",
    storyFragment:
      "The panel cracks open to reveal a rejection letter, crumpled and smoothed out a hundred times. On the back, in pen: 'Try again tomorrow.'",
    hint: "Some things break if you push hard enough.",
    xpReward: 50,
  },

  // --- Quest Board (3 secrets) ---
  {
    id: "quest-hidden-quest",
    zoneId: "quest-board",
    trigger: "scratch",
    title: "The Hidden Quest",
    storyFragment:
      "Beneath the surface: a quest that was never posted publicly. A midnight project, built for the sheer joy of building. No client, no deadline — just curiosity.",
    hint: "Scratch beneath the surface of the quest board.",
    xpReward: 50,
    achievementId: "treasure-hunter",
  },
  {
    id: "quest-blueprint",
    zoneId: "quest-board",
    trigger: "drag",
    title: "Secret Blueprint",
    storyFragment:
      "Pinned underneath: architectural sketches for a system that doesn't exist yet. Arrows, boxes, question marks. The best projects start as messy drawings.",
    hint: "Try moving things around on the quest board.",
    xpReward: 40,
  },
  {
    id: "quest-easter-egg",
    zoneId: "quest-board",
    trigger: "click",
    title: "Developer's Note",
    storyFragment:
      "// TODO: change the world\n// FIXME: impostor syndrome\n// HACK: coffee instead of sleep\n\nThe real source code comments we leave behind.",
    hint: "Click around — developers hide things everywhere.",
    xpReward: 30,
  },

  // --- Archives (3 secrets) ---
  {
    id: "archives-cipher",
    zoneId: "archives",
    trigger: "sequence",
    title: "The Cipher",
    storyFragment:
      "The encoded text unscrambles: 'Knowledge isn't power — sharing knowledge is power.' A quote taped to the inside of a desk drawer, years ago.",
    hint: "Some text in the archives isn't what it seems.",
    xpReward: 50,
    achievementId: "codebreaker",
  },
  {
    id: "archives-margin-note",
    zoneId: "archives",
    trigger: "proximity",
    title: "Margin Note",
    storyFragment:
      "Scrawled in the margin: 'Read this three times. Then read it again.' The best insights always need rereading.",
    hint: "Explore the edges of the archive pages.",
    xpReward: 30,
  },
  {
    id: "archives-invisible-ink",
    zoneId: "archives",
    trigger: "ink",
    title: "Invisible Ink",
    storyFragment:
      "Your ink trail reveals hidden text glowing beneath the page: 'The cursor is mightier than the sword.'",
    hint: "Sometimes you need to draw to reveal what's hidden.",
    xpReward: 40,
  },

  // --- Training Grounds (3 secrets) ---
  {
    id: "training-combo",
    zoneId: "training",
    trigger: "sequence",
    title: "Combo Master",
    storyFragment:
      "A hidden technique scroll unfurls: the art of combining disparate skills into something greater than the sum. Specialization is for insects.",
    hint: "Try interacting in a specific sequence.",
    xpReward: 50,
    achievementId: "dungeon-warrior",
  },
  {
    id: "training-weak-wall",
    zoneId: "training",
    trigger: "break",
    title: "Weak Wall",
    storyFragment:
      "Behind the crumbling wall: a trophy case of failures. Every bug fixed, every deadline missed, every pivot — each one a lesson earned.",
    hint: "Not all walls are meant to stand.",
    xpReward: 40,
  },
  {
    id: "training-hidden-stat",
    zoneId: "training",
    trigger: "click",
    title: "Hidden Stat",
    storyFragment:
      "A stat appears that wasn't on the character sheet: LUCK — 99. Sometimes you just have to show up and be ready.",
    hint: "Check the character sheet more carefully.",
    xpReward: 30,
  },

  // --- Messenger's Guild (2 secrets) ---
  {
    id: "messenger-pigeon-coop",
    zoneId: "messenger",
    trigger: "proximity",
    title: "The Pigeon Coop",
    storyFragment:
      "You discover a roost of carrier pigeons, each with a tiny scroll: past messages of encouragement, collaboration, and opportunity. Connection is the real quest.",
    hint: "Approach the guild carefully.",
    xpReward: 40,
  },
  {
    id: "messenger-dead-drop",
    zoneId: "messenger",
    trigger: "drag",
    title: "Dead Drop",
    storyFragment:
      "A loose stone in the wall hides a final note: 'Thanks for exploring. The real treasure was the curiosity you brought with you.'",
    hint: "Try moving something in the guild hall.",
    xpReward: 50,
  },
]

export function getSecretsForZone(zoneId: string): SecretDef[] {
  return SECRETS.filter((s) => s.zoneId === zoneId)
}

export function getSecretById(secretId: string): SecretDef | undefined {
  return SECRETS.find((s) => s.id === secretId)
}
