// Test-only loader for the committed Dash content (content/engine/*.json). Uses
// fs + JSON.parse (not a TS JSON import) so the DOM-free engine tsconfig stays
// clean and the files are validated through the real schema validators on load.
import { readFileSync } from 'node:fs'
import { tryValidateRig, tryValidateCharacter, validatePoseAgainstRig, validateClipAgainstRig, type RigTemplate, type CharacterDoc, type Pose, type Clip } from '@dash/schema'

const CONTENT = new URL('../../../content/engine/', import.meta.url)

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(rel, CONTENT), 'utf8'))
}

export const POSE_IDS = ['stand', 'walk-mid', 'jump-tuck', 'cheer', 'think', 'squash-land'] as const

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

export const CLIP_IDS = ['idle-shuffle', 'walk-cycle', 'jump'] as const

export function loadClip(id: string, rig: RigTemplate): Clip {
  const r = validateClipAgainstRig(readJson(`clips/${id}.json`), rig)
  if (!r.ok) throw new Error(`invalid clips/${id}.json:\n- ${r.errors.join('\n- ')}`)
  return r.doc
}
