// migrateNotebookV1 — THE P9 cutover script (ENGINE_V2 Phase 9, amended: migration
// is a committed script run on the then-current doc; old revisions stay valid v1
// history). Pure data transform: v1 NotebookDoc (version: 1) → NotebookDocV2, plus
// a REPORT of every lossy or approximated conversion (the honesty contract — the
// report drives the remaining content work, e.g. poses still to author).
//
// The engine base registries (rigs/characters/poses/clips/builtin behaviors) are
// SUPPLIED by the caller — schema stays zero-dep and file-free; the cutover script
// and the P9 server load content/engine/* and pass it in.
//
// Mappings:
//   panel.arrival (ArrivalDoc)  → generated behavior `arrival:p<P>:i<I>` +
//                                 panel.arrival = { behaviorId }.
//                                 pose→strikePose(holdMs=revertMs), say→say,
//                                 sfx→sfx, setFlag→setFlag; once→ when:{not:{flag}}
//                                 + a setFlag step (flag = setFlag ?? generated).
//                                 `face` is DROPPED (facing follows approach) → report.
//   panel.travel (TravelConfig) → panel.travel.pool of behavior ids:
//                                 builtins → `builtin:<mode>` (weight 1; empty/absent
//                                 builtins = the FULL builtin pool, v1 semantics),
//                                 actions → `act:<name>` (weight = actionWeight ?? 2).
//   doc.actions (custom)        → `act:<name>` BehaviorDoc. Steps map:
//                                 move→moveTo/jumpTo with CONTEXTUAL travel targets
//                                 (`travel:to#roof` etc. — TargetRef extension,
//                                 FLAGGED for owner sign-off), pose→strikePose,
//                                 say→say, sfx→sfx, wait→wait, cam→camera,
//                                 camClear→camera{}, fx→sfx approximation → report.
//                                 ActionWhen geometric gates (minHoriz…) have no
//                                 GateExpr home → dropped; the traversal graph's
//                                 arc feasibility approximates them → report.

import type { BehaviorDoc, CharacterDoc, Clip, Intent, Pose, RigTemplate } from '../index'
import type { NotebookDocV2, PageV2, PanelV2 } from '../notebook-v2'
import { isArr, isRecord, isStr, isNum } from '../validate'

export interface MigrationBase {
  rigs: Record<string, RigTemplate>
  characters: Record<string, CharacterDoc>
  poses: Record<string, Pose>
  clips: Record<string, Clip>
  /** Pre-authored behaviors, including the `builtin:<mode>` docs. */
  behaviors: Record<string, BehaviorDoc>
}

export interface MigrationReport {
  /** Human-readable notes on every lossy/approximated conversion. */
  lossy: string[]
  /** Pose names referenced by arrivals/actions but missing from base.poses —
   * the authoring checklist for the remaining legacy poses. */
  missingPoses: string[]
  /** Behavior ids referenced by travel pools but missing (builtins not yet
   * authored, unknown custom actions). */
  missingBehaviors: string[]
  generatedBehaviors: string[]
}

const V1_BUILTIN_MODES = ['walk', 'hop', 'roll', 'poof', 'vault', 'rope', 'swing', 'wallrun', 'slide', 'smash', 'combo']

export function migrateNotebookV1(
  v1: unknown,
  base: MigrationBase,
): { doc: NotebookDocV2; report: MigrationReport } {
  if (!isRecord(v1) || v1.version !== 1 || !isArr(v1.pages)) {
    throw new Error('migrateNotebookV1: input is not a v1 notebook doc (version: 1 with pages)')
  }
  const report: MigrationReport = { lossy: [], missingPoses: [], missingBehaviors: [], generatedBehaviors: [] }
  const behaviors: Record<string, BehaviorDoc> = { ...base.behaviors }
  // Generated ids must never silently clobber supplied base behaviors (review
  // finding) — the namespaces are ours, so a collision is a caller bug: throw.
  const addGenerated = (id: string, doc: BehaviorDoc): void => {
    if (base.behaviors[id]) throw new Error(`migrateNotebookV1: generated behavior id collides with base: ${JSON.stringify(id)}`)
    behaviors[id] = doc
    report.generatedBehaviors.push(id)
  }

  // v1 pose names that were RENAMED in the v2 content set (the v1 'idle' is the v2
  // rest pose 'stand'; 'walk'/'tuck'/'land' became clip-adjacent pose ids). Applied
  // before lookup so owner-authored steps keep working across the schema line.
  const V1_POSE_RENAMES: Record<string, string> = {
    idle: 'stand',
    walk: 'walk-mid',
    tuck: 'jump-tuck',
    land: 'squash-land',
  }
  const mapPose = (name: string): string => V1_POSE_RENAMES[name] ?? name
  const notePose = (name: string, where: string): void => {
    const mapped = mapPose(name)
    if (!base.poses[mapped] && !report.missingPoses.includes(mapped)) {
      report.missingPoses.push(mapped)
      report.lossy.push(`${where}: pose ${JSON.stringify(mapped)} not in base.poses yet (authoring checklist)`)
    }
  }
  const noteBehavior = (id: string, where: string): void => {
    if (!behaviors[id] && !report.missingBehaviors.includes(id)) {
      report.missingBehaviors.push(id)
      report.lossy.push(`${where}: behavior ${JSON.stringify(id)} not available (add to base or author)`)
    }
  }

  // ── custom actions → behaviors ─────────────────────────────────────────────────
  const actions = isRecord(v1.actions) ? v1.actions : {}
  for (const [name, action] of Object.entries(actions)) {
    if (!isRecord(action) || !isArr(action.steps)) continue
    const id = `act:${name}`
    const where = `actions.${name}`
    const steps: Intent[] = []
    action.steps.forEach((s, i) => {
      if (!isRecord(s)) return
      const sw = `${where}.steps[${i}]`
      switch (s.do) {
        case 'pose':
          if (isStr(s.pose)) {
            notePose(s.pose, sw)
            steps.push({
              verb: 'strikePose',
              ref: mapPose(s.pose),
              holdMs: isNum(s.ms) ? s.ms : 600,
              ...(s.face === 1 || s.face === -1 ? { face: s.face } : {}),
            } as Intent)
          }
          break
        case 'move': {
          // Stage 4 restorations: acting pose rides the move ({pose}); authored
          // speed carries ({speed} px/s). Easing remains engine-owned (the ONE
          // approved residual loss — noted only when the author set one).
          const target = contextualTarget(s.to, sw, report)
          const arc = isRecord(s) && (s as { arc?: string }).arc
          const actingPose = isStr(s.pose) && s.pose !== 'walk' ? mapPose(s.pose) : undefined
          if (actingPose) notePose(s.pose as string, sw)
          steps.push({
            verb: arc ? 'jumpTo' : 'moveTo',
            target,
            ...(actingPose ? { pose: actingPose } : {}),
            ...(isNum(s.speed) && s.speed > 0 ? { speed: s.speed } : {}),
          } as Intent)
          if (isStr(s.sfx)) steps.push({ verb: 'sfx', kind: s.sfx } as Intent)
          if (s.ease !== undefined || s.easeY !== undefined) {
            report.lossy.push(`${sw}: v1 ease/easeY dropped — the locomotion solver owns easing`)
          }
          break
        }
        case 'say':
          if (isStr(s.text)) {
            steps.push({ verb: 'say', text: s.text, ...(isNum(s.holdMs) && s.holdMs > 0 ? { holdMs: s.holdMs } : {}) } as Intent)
          }
          break
        case 'sfx':
          if (isStr(s.kind)) steps.push({ verb: 'sfx', kind: s.kind } as Intent)
          break
        case 'wait':
          if (isNum(s.ms)) steps.push({ verb: 'wait', ms: s.ms } as Intent)
          break
        case 'cam': {
          // v1 camera focus vocabulary → TargetRefs: 'dash' frames the character,
          // 'target' frames the destination, 'midpoint' IS the in-flight framing
          // the adapter applies to travel targets. mult/fast carry through.
          const to = s.on === 'dash' ? 'entity:dash' : 'travel:to#interior'
          steps.push({
            verb: 'camera',
            to,
            ms: 400,
            ...(isNum(s.mult) && s.mult > 0 ? { mult: s.mult } : {}),
            ...(typeof s.fast === 'boolean' ? { fast: s.fast } : {}),
          } as Intent)
          break
        }
        case 'camClear':
          steps.push({ verb: 'camera', ms: 400 } as Intent)
          break
        case 'fx':
          // fx sounds now DRIVE their overlays site-side (crack/smoke/shake/
          // pageShove/jitPage) — the sfx encoding is the wire format, not a loss.
          if (isStr(s.kind)) steps.push({ verb: 'sfx', kind: `fx:${s.kind}` } as Intent)
          break
        default:
          report.lossy.push(`${sw}: unknown step kind ${JSON.stringify(s.do)} dropped`)
      }
    })
    const doc: BehaviorDoc = { schemaVersion: 2, id, steps } as BehaviorDoc
    // v1 ActionWhen → the geometric gate, restored as data (Stage 4).
    if (isRecord(action.when)) {
      const w = action.when
      const geom: Record<string, unknown> = {}
      if (isNum(w.minDist)) geom.minDist = w.minDist
      if (isNum(w.maxDist)) geom.maxDist = w.maxDist
      if (isNum(w.minHoriz)) geom.minHoriz = w.minHoriz
      if (isNum(w.minVert)) geom.minVert = w.minVert
      if (w.vert === 'up' || w.vert === 'down') geom.vert = w.vert
      if (isArr(w.fromPanel)) geom.fromPanel = w.fromPanel
      if (Object.keys(geom).length > 0) (doc as { when?: unknown }).when = { geom }
    }
    addGenerated(id, doc)
  }

  // ── pages/panels ───────────────────────────────────────────────────────────────
  // v1 travel resolution merges FIELD-WISE across doc → page → panel (the
  // resolveTravelConfig spread) — a panel with no config still inherits the doc/
  // page config (review finding: panel-only migration lost global pools).
  const docTravel = isRecord(v1.travel) ? v1.travel : undefined
  const pages: PageV2[] = []
  ;(v1.pages as unknown[]).forEach((pg, p) => {
    if (!isRecord(pg) || !isArr(pg.panels)) return
    const pageTravel = isRecord(pg.travel) ? pg.travel : undefined
    const panels: PanelV2[] = []
    ;(pg.panels as unknown[]).forEach((pn, i) => {
      if (!isRecord(pn)) return
      const where = `pages[${p}].panels[${i}]`
      const panel: PanelV2 = {
        x: pn.x as number,
        y: pn.y as number,
        w: pn.w as number,
        h: pn.h as number,
        anchor: pn.anchor as { dx: number; dy: number },
      }
      if (isNum(pn.rotate)) panel.rotate = pn.rotate
      if (isStr(pn.sketch)) panel.sketch = pn.sketch
      if (isArr(pn.boxes)) panel.boxes = pn.boxes
      if (isStr(pn.pid)) panel.pid = pn.pid

      if (isRecord(pn.arrival)) {
        const a = pn.arrival
        const id = `arrival:p${p}:i${i}`
        const steps: Intent[] = []
        const onceFlag = a.once ? (isStr(a.setFlag) ? a.setFlag : `${id}:done`) : null
        if (onceFlag) steps.push({ verb: 'setFlag', flag: onceFlag } as Intent)
        const face = a.face === 1 || a.face === -1 ? (a.face as 1 | -1) : undefined
        if (isStr(a.pose)) {
          notePose(a.pose, `${where}.arrival`)
          // v1 semantics restored (parity Stage 2c/4): no/zero revertMs leaves the
          // pose until the NEXT transition — strikePose {hold:'persist'} rides the
          // acting layer, the behavior completes, and the character stays
          // interactable in the pose (the legacy Fight swings its sword until you
          // navigate away). Authored revertMs stays a timed hold; authored FACE
          // applies with the strike (the legacy Fight faces LEFT).
          if (isNum(a.revertMs) && a.revertMs > 0) {
            steps.push({ verb: 'strikePose', ref: mapPose(a.pose), holdMs: a.revertMs, ...(face ? { face } : {}) } as Intent)
          } else {
            steps.push({ verb: 'strikePose', ref: mapPose(a.pose), hold: 'persist', ...(face ? { face } : {}) } as Intent)
          }
        } else if (face) {
          // face WITHOUT a pose (v1 allowed it): a momentary rest-pose strike
          // carries the facing — visually the same figure, turned.
          steps.push({ verb: 'strikePose', ref: 'stand', holdMs: 1, face } as Intent)
        }
        if (isStr(a.say)) steps.push({ verb: 'say', text: a.say } as Intent)
        if (isStr(a.sfx)) steps.push({ verb: 'sfx', kind: a.sfx } as Intent)
        if (isStr(a.setFlag) && !a.once) steps.push({ verb: 'setFlag', flag: a.setFlag } as Intent)
        const doc: BehaviorDoc = { schemaVersion: 2, id, steps } as BehaviorDoc
        if (onceFlag) (doc as { when?: unknown }).when = { not: { flag: onceFlag } }
        addGenerated(id, doc)
        // `flourish` rides the panel (render-layer): the adapter rolls the legacy
        // 24% knock/shove/squish only where v1 allowed it (Stage 4 restoration).
        panel.arrival = { behaviorId: id, ...(typeof a.flourish === 'boolean' ? { flourish: a.flourish } : {}), ...(isStr(a.pose) ? { hasPose: true } : {}) }
      }

      const panelTravel = isRecord(pn.travel) ? pn.travel : undefined
      const t = docTravel || pageTravel || panelTravel ? { ...docTravel, ...pageTravel, ...panelTravel } : null
      if (t) {
        const pool: { behaviorId: string; weight?: number }[] = []
        const builtins = isArr(t.builtins) && t.builtins.length > 0 ? (t.builtins as string[]) : V1_BUILTIN_MODES
        for (const mode of builtins) {
          const id = `builtin:${mode}`
          noteBehavior(id, `${where}.travel`)
          pool.push({ behaviorId: id })
        }
        if (isArr(t.actions)) {
          // v1 weight semantics: max(0, floor(actionWeight ?? 1)); 0 = disabled.
          const weight = Math.max(0, Math.floor(isNum(t.actionWeight) ? t.actionWeight : 1))
          for (const name of t.actions as string[]) {
            const id = `act:${name}`
            if (weight === 0) {
              report.lossy.push(`${where}.travel: action ${JSON.stringify(name)} disabled by actionWeight 0 — omitted from the pool`)
              continue
            }
            noteBehavior(id, `${where}.travel`)
            pool.push({ behaviorId: id, weight })
          }
        }
        if (pool.length > 0) panel.travel = { pool }
      }
      panels.push(panel)
    })
    pages.push({ ...(isStr(pg.name) ? { name: pg.name } : {}), ...(isStr(pg.snark) ? { snark: pg.snark } : {}), panels })
  })

  const doc: NotebookDocV2 = {
    schemaVersion: 2,
    seed: 7,
    cover: v1.cover,
    pages,
    rigs: base.rigs,
    characters: base.characters,
    poses: base.poses,
    clips: base.clips,
    behaviors,
  }
  return { doc, report }
}

/** v1 MoveTarget → TargetRef. Contextual travel refs (`travel:to#…`) are a FLAGGED
 * TargetRef grammar extension (closed set — owner sign-off recorded in the 9a PR):
 * a travel behavior runs between two panels resolved at runtime, exactly like the
 * v1 cue compiler's from/to context. */
function contextualTarget(to: unknown, where: string, report: MigrationReport): string {
  if (!isRecord(to)) return 'travel:to#interior'
  if (to.at === 'anchor') return 'travel:to#interior'
  if (to.at === 'panelEdge') {
    const panel = to.panel === 'from' ? 'from' : 'to'
    const side = isStr(to.side) ? to.side : 'top'
    // v2 spots: top → roof; left/right → the EDGE spot (Stage 4 — the run-up
    // target restored; the resolver picks the side toward the other panel,
    // which is what every v1 edge move meant).
    if (side === 'top') return `travel:${panel}#roof`
    return `travel:${panel}#edge`
  }
  report.lossy.push(`${where}.to: unmapped v1 target ${JSON.stringify(to)} → travel:to#interior`)
  return 'travel:to#interior'
}
