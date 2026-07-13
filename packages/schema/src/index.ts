// @dash/schema — types, validator harness, versioning & migrations. Zero deps.

export { CURRENT_SCHEMA_VERSION } from './envelope'
export type { DocEnvelope } from './envelope'

export { tryValidate, isRecord, isNum, isStr, isBool, isArr, inRange } from './validate'
export type { Check, Issues, ValidateResult, ValidateOk, ValidateErr } from './validate'

export { registerMigration, migrateToCurrent } from './migrations'
export type { MigrationFn, VersionedDoc } from './migrations'

export { tryValidateWorldV2, COMPONENT_NAMES } from './world'
export type {
  WorldDocV2,
  EntityDoc,
  ComponentDoc,
  ComponentName,
  Vec2,
  Vec2Delta,
  Box,
  Segment,
  TransformComponent,
  SurfaceComponent,
  CollidableComponent,
  RigInstanceComponent,
  LocomotionComponent,
  DisturbableStub,
  DamageableStub,
  EmitterStub,
  ProjectileStub,
  AttachmentStub,
  SpeechStub,
  HoleEdge,
  HolePersistScope,
} from './world'

// ── Phase 6b: interaction rule table (L5) ────────────────────────────────────
export { tryValidateRuleTable, WORLD_RESPONSE_KINDS } from './rules'
export type { RuleRow, RuleTableDoc, WorldResponse, WorldResponseKind, ComponentKind } from './rules'

// ── Phase 2: rig / pose / character (L0–L1a) ─────────────────────────────────
export { tryValidateRig } from './rig'
export type { RigTemplate, JointDef, IkChainDef, Attach } from './rig'

export { tryValidatePose, validatePoseAgainstRig } from './pose'
export type { Pose, RootOffset, PoseProp, PropElement, PoseFace } from './pose'

// ── parity recovery Stage 2b: expressive data skins (L1c) ────────────────────
export { tryValidatePoseSkin, tryValidateSkinKeyframes, validateSkinAgainstKeyframes } from './skin'
export type { PoseSkinDoc, SkinKeyframesDoc, SkinKeyframe, SkinFrame, SkinElement, SkinAnimRef } from './skin'

export { tryValidateCharacter } from './character'
export type {
  CharacterDoc,
  StrokeStyle,
  PersonalityParams,
  LocomotionCaps,
  LocomotionMode,
} from './character'

// ── Phase 3: clips (L1b) ─────────────────────────────────────────────────────
export { tryValidateClip, validateClipAgainstRig, clipWarnings, clipDuration, EASE_PRESETS } from './clip'
export type { Clip, ClipKey, ClipTrack, ClipRootKey, ClipRootTrack, ClipMarker, EasePreset } from './clip'

// ── Phase 7a: behaviors + intents + target refs (L6 authoring surface) ───────
export {
  tryValidateBehavior,
  validateBehaviorAgainstWorld,
  parseTargetRef,
  evalGate,
  INTENT_VERBS,
  MOVEMENT_VERBS,
  REACTION_TRIGGERS,
  MILESTONES,
  CUE_VERBS,
  checkIntentValue,
  checkReactions,
} from './behavior'
export type {
  BehaviorDoc,
  Intent,
  IntentVerb,
  MovementVerb,
  MoveIntent,
  TargetRef,
  EntityRef,
  ParsedTarget,
  ReactionTrigger,
  Milestone,
  Cue,
  CueVerb,
  GateExpr,
  GeomGate,
  GeomCtx,
} from './behavior'

export { tryValidateNotebookV2 } from './notebook-v2'
export type { NotebookDocV2, PageV2, PanelV2 } from './notebook-v2'
export { migrateNotebookV1 } from './migrations/v1-notebook'
export type { MigrationBase, MigrationReport } from './migrations/v1-notebook'
