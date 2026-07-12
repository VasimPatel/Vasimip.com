// Test-only content loader for the @dash/headless acceptance suite. Mirrors
// packages/engine/test/content.ts: reads the committed Dash content
// (content/engine/*.json) via fs + JSON.parse (never a TS JSON import, so the
// DOM-free tsconfig stays clean) and runs every doc through the real schema
// validators on load. Assembles a ready-to-use CharacterSpec so the acceptance
// tests exercise the PUBLIC headless surface (simulate/replay) with real content,
// exactly as a future MCP tool would supply it.
import { readFileSync } from 'node:fs'
import {
  tryValidateRig,
  tryValidateCharacter,
  tryValidateBehavior,
  validatePoseAgainstRig,
  validateClipAgainstRig,
  type RigTemplate,
  type CharacterDoc,
  type Pose,
  type Clip,
  type BehaviorDoc,
} from '@dash/schema'
import type { CharacterSpec } from '../src/index'

const CONTENT = new URL('../../../content/engine/', import.meta.url)

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(rel, CONTENT), 'utf8'))
}

export function loadRig(): RigTemplate {
  const r = tryValidateRig(readJson('rig.dash.json'))
  if (!r.ok) throw new Error(`invalid rig.dash.json:\n- ${r.errors.join('\n- ')}`)
  return r.doc
}

export function loadCharacter(): CharacterDoc {
  const r = tryValidateCharacter(readJson('character.dash.json'))
  if (!r.ok) throw new Error(`invalid character.dash.json:\n- ${r.errors.join('\n- ')}`)
  return r.doc
}

export function loadPose(id: string, rig: RigTemplate): Pose {
  const r = validatePoseAgainstRig(readJson(`poses/${id}.json`), rig)
  if (!r.ok) throw new Error(`invalid poses/${id}.json:\n- ${r.errors.join('\n- ')}`)
  return r.doc
}

export function loadClip(id: string, rig: RigTemplate): Clip {
  const r = validateClipAgainstRig(readJson(`clips/${id}.json`), rig)
  if (!r.ok) throw new Error(`invalid clips/${id}.json:\n- ${r.errors.join('\n- ')}`)
  return r.doc
}

/** A re-authored built-in behavior doc (content/engine/behaviors/<name>.json). */
export function loadBehavior(name: string): BehaviorDoc {
  const r = tryValidateBehavior(readJson(`behaviors/${name}.json`))
  if (!r.ok) throw new Error(`invalid behaviors/${name}.json:\n- ${r.errors.join('\n- ')}`)
  return r.doc
}

/** The real committed notebook (worldFromNotebook(notebook.pages) → PageWorld[]). */
export const notebook = JSON.parse(
  readFileSync(new URL('../../../src/notebook/notebook.json', import.meta.url), 'utf8'),
) as { pages: { name: string; panels: { x: number; y: number; w: number; h: number; anchor: { dx: number; dy: number }; rotate?: number }[] }[] }

/**
 * A complete, JSON-pure CharacterSpec for Dash — rig + character + the poses/clips
 * the locomotion solver looks up by name, exactly as simulate()/replay() consume it.
 * Every doc here is plain data (simulate deep-copies them in), so building this once
 * and reusing it across tests cannot leak state between sims.
 */
export function dashSpec(overrides: Partial<CharacterSpec> = {}): CharacterSpec {
  const rig = loadRig()
  const character = loadCharacter()
  const poses = {
    stand: loadPose('stand', rig),
    'squash-land': loadPose('squash-land', rig),
    'jump-tuck': loadPose('jump-tuck', rig),
    cheer: loadPose('cheer', rig),
    think: loadPose('think', rig),
  }
  const clips = {
    jump: loadClip('jump', rig),
    'idle-shuffle': loadClip('idle-shuffle', rig),
    'walk-cycle': loadClip('walk-cycle', rig),
  }
  return {
    character,
    rig,
    poses,
    clips,
    names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
    restPose: poses.stand,
    ...overrides,
  }
}
