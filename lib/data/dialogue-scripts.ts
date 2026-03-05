export interface DialogueLine {
  speaker: string
  text: string
  speakerType?: "narrator" | "character" | "system"
}

export interface DialogueChoice {
  id: string
  label: string
  nextNodeId: string
}

export interface DialogueNode {
  id: string
  lines: DialogueLine[]
  choices?: DialogueChoice[]
  nextNodeId?: string // auto-advance to this node if no choices
}

export interface DialogueScript {
  id: string
  startNodeId: string
  nodes: Record<string, DialogueNode>
}

export const DIALOGUE_SCRIPTS: Record<string, DialogueScript> = {
  "origin-intro": {
    id: "origin-intro",
    startNodeId: "start",
    nodes: {
      start: {
        id: "start",
        lines: [
          { speaker: "Narrator", text: "In a world of infinite code and endless possibility...", speakerType: "narrator" },
          { speaker: "Narrator", text: "One developer embarked on a quest to build something extraordinary.", speakerType: "narrator" },
          { speaker: "Vasim", text: "Hey there! I'm Vasim — a software engineer who believes code should be an adventure.", speakerType: "character" },
        ],
        choices: [
          { id: "more", label: "Tell me more", nextNodeId: "more-about" },
          { id: "powers", label: "What are your superpowers?", nextNodeId: "superpowers" },
          { id: "skip", label: "[Skip]", nextNodeId: "end" },
        ],
      },
      "more-about": {
        id: "more-about",
        lines: [
          { speaker: "Vasim", text: "I started coding because I loved building things people could interact with.", speakerType: "character" },
          { speaker: "Vasim", text: "Now I craft full-stack applications with a focus on delightful user experiences.", speakerType: "character" },
          { speaker: "Vasim", text: "When I'm not coding, I'm sketching ideas, playing video games, or exploring new tech.", speakerType: "character" },
        ],
        nextNodeId: "end",
      },
      superpowers: {
        id: "superpowers",
        lines: [
          { speaker: "Vasim", text: "Glad you asked! My primary abilities are:", speakerType: "character" },
          { speaker: "System", text: "[STR] React & Next.js — building powerful interfaces", speakerType: "system" },
          { speaker: "System", text: "[DEX] CSS & Animation — making things feel alive", speakerType: "system" },
          { speaker: "System", text: "[INT] TypeScript — writing code that explains itself", speakerType: "system" },
          { speaker: "Vasim", text: "And I'm always leveling up — currently training in AI/ML and system design.", speakerType: "character" },
        ],
        nextNodeId: "end",
      },
      end: {
        id: "end",
        lines: [
          { speaker: "Vasim", text: "Feel free to explore! There's a lot to discover in this world.", speakerType: "character" },
          { speaker: "System", text: "+50 XP — Origin Story explored!", speakerType: "system" },
        ],
      },
    },
  },

  "archives-intro": {
    id: "archives-intro",
    startNodeId: "start",
    nodes: {
      start: {
        id: "start",
        lines: [
          { speaker: "Narrator", text: "You enter the Ancient Archives — a vast library of knowledge.", speakerType: "narrator" },
          { speaker: "Librarian", text: "Welcome, adventurer. These tomes contain wisdom from past quests.", speakerType: "character" },
          { speaker: "Librarian", text: "Read carefully — some pages contain hidden secrets...", speakerType: "character" },
        ],
      },
    },
  },
}
