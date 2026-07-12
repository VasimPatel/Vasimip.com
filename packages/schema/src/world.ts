// ─────────────────────────────────────────────────────────────────────────────
// WorldDocV2 — the real, typed-component ECS world doc (ENGINE_V2 §2/§5), built in
// Phase 6a. Replaces the Phase-1 placeholder ({id,x,y} bag) wholesale.
//
//   WorldDocV2 = { schemaVersion, seed, entities: EntityDoc[] }
//   EntityDoc  = { id, components: ComponentDoc, meta? }
//
// `components` is a typed map drawn ONLY from the CLOSED component set (§2). The
// validator REJECTS any component name outside that set (closed-set enforcement at
// validation time) so 6b/P7 can fill the stubs in without a schema-version bump.
//
// 6a defines REAL types for: transform, surface, collidable, rigInstance,
// locomotion. The rest of the closed set are typed STUBS: an object that may carry
// ONLY its documented reserved fields and is rejected if it carries anything else —
// so the shape is nailed down now and 6b/P7 flesh out the bodies.
//
// PANEL CONTENT IS RENDER-LAYER (§2, amended): a panel entity's whiteboard boxes /
// sketch / arrival are NOT components. They ride on the opaque `EntityDoc.meta`
// field, which the ENGINE never reads — only the renderer/site does. `meta` is not
// structurally validated; it is a pass-through render payload.
// ─────────────────────────────────────────────────────────────────────────────

import { CURRENT_SCHEMA_VERSION, type DocEnvelope } from './envelope'
import { tryValidate, isRecord, isNum, isStr, isArr, type ValidateResult, type Issues } from './validate'
import type { LocomotionCaps } from './character'

// ── shared geometry primitives (single source of truth; engine imports these) ────
export interface Vec2 {
  x: number
  y: number
}
/** A line segment. Panel collision boundaries are sets of these. */
export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

// ── the closed component set (§2) ────────────────────────────────────────────────
export const COMPONENT_NAMES = [
  'transform',
  'rigInstance',
  'locomotion',
  'collidable',
  'surface',
  'disturbable',
  'damageable',
  'emitter',
  'projectile',
  'attachment',
  'speech',
] as const
export type ComponentName = (typeof COMPONENT_NAMES)[number]

// ── REAL component types (6a) ────────────────────────────────────────────────────

/** L5 world-space placement. `rot` is authored but NOT consumed by 6a geometry
 * (surfaces are axis-aligned — see the rotation punt below); it lands in 6b/P9. */
export interface TransformComponent {
  x: number
  y: number
  rot?: number
}

/** Panel surface geometry SOURCE (§2). Stores only the axis-aligned box + the
 * legacy anchor; the derived standable lines/edges/spots are computed (pure) by
 * engine `surfaceGeometry()` — never denormalized into the doc, so the box stays the
 * single source of truth for a panel's shape. */
export interface SurfaceComponent {
  box: Box
  /** Legacy panel anchor (interior standable point = box.x+dx, box.y+dy). */
  anchor: Vec2Delta
}
export interface Vec2Delta {
  dx: number
  dy: number
}

/** Collision shape. character = capsule, prop = aabb, panel = segment set. The
 * panel `segments` are the MUTABLE collision boundary 6b cuts holes into (kept
 * separate from `surface.box` on purpose — see §6 flags in the report). */
export type CollidableComponent =
  | { shape: 'capsule'; x0: number; y0: number; x1: number; y1: number; r: number }
  | { shape: 'aabb'; x: number; y: number; w: number; h: number }
  | { shape: 'segments'; segments: Segment[] }

/** L0 instance reference — which CharacterDoc this entity renders/animates as. */
export interface RigInstanceComponent {
  character: string
}

/** Locomotion is a REFERENCE to a CharacterDoc's caps (`character`), with an
 * optional inline `caps` OVERRIDE (documented choice: reference-primary). The P6
 * traversal graph reads caps from the referenced CharacterDoc; `caps`, when present,
 * wins. Breaks the P6↔P7 circularity (caps are data, never solver internals). */
export interface LocomotionComponent {
  character: string
  caps?: LocomotionCaps
}

// ── typed STUBS (reserved-only; unknown fields rejected) — filled by 6b/P7 ────────
/** 6b interaction rule character×disturbable→impulse. `mass` reserved. */
export interface DisturbableStub {
  mass?: number
}

/** Which panel edge a boundary cut ("hole") is taken out of. `floorIn` is the
 * interior anchor line; the other four are the physical box edges (§ surfaces). */
export type HoleEdge = 'roof' | 'wallL' | 'wallR' | 'bottom' | 'floorIn'

/** Persistence policy for a cut. `none` heals after `healAfterMs`; `session` stays
 * until the world is rebuilt; `saved` is a SCHEMA KNOB ONLY — it validates here but
 * the 6b runtime REJECTS it (persisting cuts to authored content lands post-P9). */
export type HolePersistScope = 'none' | 'session' | 'saved'

/** 6b mutable boundaries (holes/heal). Panels carrying this component can be CUT at
 * runtime; the fields below are the panel's DEFAULT heal policy (a per-cut `opts`
 * overrides them). `hp` reserved for a future damage model. */
export interface DamageableStub {
  hp?: number
  /** 6b SCHEMA FIELD: default ms after a cut before the boundary knits back ("the
   * notebook redraws itself"). Omitted → engine DEFAULT_HEAL_MS. */
  healAfterMs?: number
  /** 6b SCHEMA FIELD: default persist scope for cuts on this panel (see HolePersistScope). */
  persistScope?: HolePersistScope
}
/** P7 `emit` intent. `kind` reserved. */
export interface EmitterStub {
  kind?: string
}
/** P7 projectile motion + projectile×damageable→cut. `speed` reserved. */
export interface ProjectileStub {
  speed?: number
}
/** P7 attach/detach. `to`/`point` reserved. */
export interface AttachmentStub {
  to?: string
  point?: string
}
/** P7 `say`. `text` reserved. */
export interface SpeechStub {
  text?: string
}

/** The typed component map. Every field optional; presence is what matters. */
export interface ComponentDoc {
  transform?: TransformComponent
  rigInstance?: RigInstanceComponent
  locomotion?: LocomotionComponent
  collidable?: CollidableComponent
  surface?: SurfaceComponent
  disturbable?: DisturbableStub
  damageable?: DamageableStub
  emitter?: EmitterStub
  projectile?: ProjectileStub
  attachment?: AttachmentStub
  speech?: SpeechStub
}

export interface EntityDoc {
  id: string
  components: ComponentDoc
  /** Opaque render payload (panel boxes / sketch / arrival). ENGINE NEVER READS
   * THIS. Not structurally validated — it is render-layer, not a component. */
  meta?: unknown
}

export interface WorldDocV2 extends DocEnvelope {
  seed: number
  entities: EntityDoc[]
}

// ── validation ───────────────────────────────────────────────────────────────────

const COMPONENT_SET: ReadonlySet<string> = new Set(COMPONENT_NAMES)

function rejectUnknownKeys(o: Record<string, unknown>, allowed: readonly string[], path: string, issues: Issues): void {
  const set = new Set(allowed)
  for (const k of Object.keys(o)) if (!set.has(k)) issues.push(`${path}.${k}: unknown field (closed schema)`)
}

function checkBox(o: unknown, path: string, issues: Issues): void {
  if (!isRecord(o)) return void issues.push(`${path}: required {x, y, w, h}`)
  for (const k of ['x', 'y', 'w', 'h'] as const) if (!isNum(o[k])) issues.push(`${path}.${k}: required finite number`)
}

function checkTransform(o: Record<string, unknown>, path: string, issues: Issues): void {
  rejectUnknownKeys(o, ['x', 'y', 'rot'], path, issues)
  if (!isNum(o.x)) issues.push(`${path}.x: required finite number`)
  if (!isNum(o.y)) issues.push(`${path}.y: required finite number`)
  if (o.rot !== undefined && !isNum(o.rot)) issues.push(`${path}.rot: must be a finite number when present`)
}

function checkSurface(o: Record<string, unknown>, path: string, issues: Issues): void {
  rejectUnknownKeys(o, ['box', 'anchor'], path, issues)
  checkBox(o.box, `${path}.box`, issues)
  if (!isRecord(o.anchor)) issues.push(`${path}.anchor: required {dx, dy}`)
  else {
    if (!isNum(o.anchor.dx)) issues.push(`${path}.anchor.dx: required finite number`)
    if (!isNum(o.anchor.dy)) issues.push(`${path}.anchor.dy: required finite number`)
  }
}

function checkCollidable(o: Record<string, unknown>, path: string, issues: Issues): void {
  if (o.shape === 'capsule') {
    rejectUnknownKeys(o, ['shape', 'x0', 'y0', 'x1', 'y1', 'r'], path, issues)
    for (const k of ['x0', 'y0', 'x1', 'y1', 'r'] as const) if (!isNum(o[k])) issues.push(`${path}.${k}: required finite number`)
    if (isNum(o.r) && o.r < 0) issues.push(`${path}.r: must be >= 0`)
  } else if (o.shape === 'aabb') {
    rejectUnknownKeys(o, ['shape', 'x', 'y', 'w', 'h'], path, issues)
    for (const k of ['x', 'y', 'w', 'h'] as const) if (!isNum(o[k])) issues.push(`${path}.${k}: required finite number`)
  } else if (o.shape === 'segments') {
    rejectUnknownKeys(o, ['shape', 'segments'], path, issues)
    if (!isArr(o.segments)) issues.push(`${path}.segments: required array`)
    else
      o.segments.forEach((s, i) => {
        if (!isRecord(s)) return void issues.push(`${path}.segments[${i}]: required {x1,y1,x2,y2}`)
        for (const k of ['x1', 'y1', 'x2', 'y2'] as const) if (!isNum(s[k])) issues.push(`${path}.segments[${i}].${k}: required finite number`)
      })
  } else {
    issues.push(`${path}.shape: must be 'capsule' | 'aabb' | 'segments'`)
  }
}

function checkRigInstance(o: Record<string, unknown>, path: string, issues: Issues): void {
  rejectUnknownKeys(o, ['character'], path, issues)
  if (!isStr(o.character) || o.character.length === 0) issues.push(`${path}.character: required non-empty string (CharacterDoc id)`)
}

const LOCO_MODES = new Set(['walk', 'hop', 'fly'])
function checkCaps(o: unknown, path: string, issues: Issues): void {
  if (!isRecord(o)) return void issues.push(`${path}: required {modes, ...}`)
  rejectUnknownKeys(o, ['modes', 'maxJumpHeight', 'maxJumpDistance', 'flySpeed'], path, issues)
  if (!isArr(o.modes) || o.modes.length === 0) issues.push(`${path}.modes: required non-empty array`)
  else o.modes.forEach((m, i) => { if (!isStr(m) || !LOCO_MODES.has(m)) issues.push(`${path}.modes[${i}]: must be 'walk' | 'hop' | 'fly'`) })
  for (const k of ['maxJumpHeight', 'maxJumpDistance', 'flySpeed'] as const)
    if (o[k] !== undefined && !isNum(o[k])) issues.push(`${path}.${k}: must be a finite number when present`)
}

function checkLocomotion(o: Record<string, unknown>, path: string, issues: Issues): void {
  rejectUnknownKeys(o, ['character', 'caps'], path, issues)
  if (!isStr(o.character) || o.character.length === 0) issues.push(`${path}.character: required non-empty string (CharacterDoc id)`)
  if (o.caps !== undefined) checkCaps(o.caps, `${path}.caps`, issues)
}

/** A stub checker: the object may carry ONLY its reserved fields (all optional),
 * anything else is rejected — nailing the shape down for 6b/P7. */
function stubCheck(reserved: readonly string[], numeric: readonly string[] = [], strings: readonly string[] = []) {
  return (o: Record<string, unknown>, path: string, issues: Issues): void => {
    rejectUnknownKeys(o, reserved, path, issues)
    for (const k of numeric) if (o[k] !== undefined && !isNum(o[k])) issues.push(`${path}.${k}: must be a finite number when present`)
    for (const k of strings) if (o[k] !== undefined && !isStr(o[k])) issues.push(`${path}.${k}: must be a string when present`)
  }
}

const HOLE_PERSIST = new Set(['none', 'session', 'saved'])
function checkDamageable(o: Record<string, unknown>, path: string, issues: Issues): void {
  rejectUnknownKeys(o, ['hp', 'healAfterMs', 'persistScope'], path, issues)
  if (o.hp !== undefined && !isNum(o.hp)) issues.push(`${path}.hp: must be a finite number when present`)
  if (o.healAfterMs !== undefined && (!isNum(o.healAfterMs) || o.healAfterMs < 0)) issues.push(`${path}.healAfterMs: must be a finite number >= 0 when present`)
  if (o.persistScope !== undefined && (!isStr(o.persistScope) || !HOLE_PERSIST.has(o.persistScope)))
    issues.push(`${path}.persistScope: must be 'none' | 'session' | 'saved'`)
}

type ComponentChecker = (o: Record<string, unknown>, path: string, issues: Issues) => void
const CHECKERS: Record<ComponentName, ComponentChecker> = {
  transform: checkTransform,
  rigInstance: checkRigInstance,
  locomotion: checkLocomotion,
  collidable: checkCollidable,
  surface: checkSurface,
  disturbable: stubCheck(['mass'], ['mass']),
  damageable: checkDamageable,
  emitter: stubCheck(['kind'], [], ['kind']),
  projectile: stubCheck(['speed'], ['speed']),
  attachment: stubCheck(['to', 'point'], [], ['to', 'point']),
  speech: stubCheck(['text'], [], ['text']),
}

function checkEntities(x: unknown, issues: Issues): void {
  if (!isArr(x)) return void issues.push('entities: required array')
  const ids = new Set<string>()
  x.forEach((e, i) => {
    const path = `entities[${i}]`
    if (!isRecord(e)) return void issues.push(`${path}: must be an object`)
    if (!isStr(e.id) || e.id.length === 0) issues.push(`${path}.id: required non-empty string`)
    else if (ids.has(e.id)) issues.push(`${path}.id: duplicate id ${JSON.stringify(e.id)}`)
    else ids.add(e.id)

    if (!isRecord(e.components)) {
      issues.push(`${path}.components: required object (typed component map)`)
    } else {
      for (const name of Object.keys(e.components)) {
        if (!COMPONENT_SET.has(name)) {
          issues.push(`${path}.components.${name}: unknown component (closed set: ${COMPONENT_NAMES.join(', ')})`)
          continue
        }
        const val = e.components[name]
        if (!isRecord(val)) issues.push(`${path}.components.${name}: must be an object`)
        else CHECKERS[name as ComponentName](val, `${path}.components.${name}`, issues)
      }
    }
    // `meta` is opaque render-layer — intentionally NOT validated. Any other
    // top-level entity field is rejected (closed schema).
    rejectUnknownKeys(e, ['id', 'components', 'meta'], path, issues)
  })
}

export function tryValidateWorldV2(doc: unknown): ValidateResult<WorldDocV2> {
  return tryValidate<WorldDocV2>(doc, [
    (d, issues) => {
      if (d.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        issues.push(`schemaVersion: must be ${CURRENT_SCHEMA_VERSION}, got ${JSON.stringify(d.schemaVersion)}`)
      }
      if (!isNum(d.seed)) issues.push('seed: required finite number')
      checkEntities(d.entities, issues)
      // Top-level closure (P8 review): a world doc is EXACTLY {schemaVersion, seed,
      // entities}. Without this, a doc carrying another kind's discriminant (e.g.
      // steps[]) could pass as a world and defeat shape dispatch.
      rejectUnknownKeys(d, ['schemaVersion', 'seed', 'entities'], 'doc', issues)
    },
  ])
}
