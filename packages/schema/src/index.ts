// @dash/schema — types, validator harness, versioning & migrations. Zero deps.

export { CURRENT_SCHEMA_VERSION } from './envelope'
export type { DocEnvelope } from './envelope'

export { tryValidate, isRecord, isNum, isStr, isArr, inRange } from './validate'
export type { Check, Issues, ValidateResult, ValidateOk, ValidateErr } from './validate'

export { registerMigration, migrateToCurrent } from './migrations'
export type { MigrationFn, VersionedDoc } from './migrations'

export { tryValidateWorldV2 } from './world'
export type { WorldDocV2, WorldEntityV2 } from './world'

// ── Phase 2: rig / pose / character (L0–L1a) ─────────────────────────────────
export { tryValidateRig } from './rig'
export type { RigTemplate, JointDef, IkChainDef, Attach } from './rig'

export { tryValidatePose, validatePoseAgainstRig } from './pose'
export type { Pose, RootOffset } from './pose'

export { tryValidateCharacter } from './character'
export type {
  CharacterDoc,
  StrokeStyle,
  PersonalityParams,
  LocomotionCaps,
  LocomotionMode,
} from './character'
