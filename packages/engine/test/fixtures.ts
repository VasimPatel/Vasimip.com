// Shared P5 test fixtures — load the real Dash rig / character / stand pose from
// content/engine and validate them into typed docs. readFileSync + JSON.parse (not a
// JSON module import) keeps the engine tsconfig free of resolveJsonModule, and the
// validators give us fully typed docs. No wall-clock / random here (determinism lint).

import { readFileSync } from 'node:fs'
import {
  tryValidateRig,
  tryValidateCharacter,
  validatePoseAgainstRig,
  type RigTemplate,
  type CharacterDoc,
  type Pose,
} from '@dash/schema'

const CONTENT = new URL('../../../content/engine/', import.meta.url)
function load(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(rel, CONTENT), 'utf8'))
}

const rigR = tryValidateRig(load('rig.dash.json'))
if (!rigR.ok) throw new Error('rig invalid: ' + rigR.errors.join('; '))
export const rig: RigTemplate = rigR.doc

const charR = tryValidateCharacter(load('character.dash.json'))
if (!charR.ok) throw new Error('character invalid: ' + charR.errors.join('; '))
export const character: CharacterDoc = charR.doc

const standR = validatePoseAgainstRig(load('poses/stand.json'), rig)
if (!standR.ok) throw new Error('stand invalid: ' + standR.errors.join('; '))
export const stand: Pose = standR.doc

const cheerR = validatePoseAgainstRig(load('poses/cheer.json'), rig)
if (!cheerR.ok) throw new Error('cheer invalid: ' + cheerR.errors.join('; '))
export const cheer: Pose = cheerR.doc

export const props = character.proportions
