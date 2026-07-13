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
    if (action.when !== undefined) {
      report.lossy.push(`${where}.when: geometric gate dropped — the traversal graph's arc feasibility approximates it`)
    }
    const steps: Intent[] = []
    action.steps.forEach((s, i) => {
      if (!isRecord(s)) return
      const sw = `${where}.steps[${i}]`
      switch (s.do) {
        case 'pose':
          if (isStr(s.pose)) {
            notePose(s.pose, sw)
            if (s.face !== undefined) report.lossy.push(`${sw}.face: dropped — facing follows the approach direction`)
            steps.push({ verb: 'strikePose', ref: mapPose(s.pose), holdMs: isNum(s.ms) ? s.ms : 600 } as Intent)
          }
          break
        case 'move': {
          const target = contextualTarget(s.to, sw, report)
          const arc = isRecord(s) && (s as { arc?: string }).arc
          steps.push({ verb: arc ? 'jumpTo' : 'moveTo', target } as Intent)
          if (isStr(s.sfx)) steps.push({ verb: 'sfx', kind: s.sfx } as Intent)
          if (isStr(s.pose) && s.pose !== 'walk') notePose(s.pose, sw)
          if (s.ease !== undefined || s.speed !== undefined || s.easeY !== undefined || s.ms !== undefined) {
            report.lossy.push(`${sw}: v1 ease/easeY/speed/ms dropped — the locomotion solver owns motion feel now`)
          }
          if (isStr(s.pose) && s.pose !== 'walk') {
            report.lossy.push(`${sw}.pose: v1 acting pose during a move approximated — 9b maps it to an onLaunch cue where the move is a jump`)
          }
          break
        }
        case 'say':
          if (isStr(s.text)) {
            if (s.holdMs !== undefined) report.lossy.push(`${sw}.holdMs: say duration is engine-standard now (SAY_DURATION_MS)`)
            steps.push({ verb: 'say', text: s.text } as Intent)
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
          // 'target' frames the travel destination; 'midpoint'/raw coords have no
          // ref-shaped home → approximate as the destination, with a report note.
          let to: string | undefined
          if (s.on === 'dash') to = 'entity:dash'
          else if (s.on === 'target') to = 'travel:to#interior'
          else {
            report.lossy.push(`${sw}.on: camera focus ${JSON.stringify(s.on)} approximated as travel:to#interior`)
            to = 'travel:to#interior'
          }
          if (s.mult !== undefined || s.fast !== undefined) {
            report.lossy.push(`${sw}: camera mult/fast dropped — 9b's camera wiring owns zoom feel`)
          }
          steps.push({ verb: 'camera', to, ms: 400 } as Intent)
          break
        }
        case 'camClear':
          steps.push({ verb: 'camera', ms: 400 } as Intent)
          break
        case 'fx':
          report.lossy.push(`${sw}: fx ${JSON.stringify(s.kind)} approximated as sfx — real fx wiring is P9b`)
          if (isStr(s.kind)) steps.push({ verb: 'sfx', kind: `fx:${s.kind}` } as Intent)
          break
        default:
          report.lossy.push(`${sw}: unknown step kind ${JSON.stringify(s.do)} dropped`)
      }
    })
    addGenerated(id, { schemaVersion: 2, id, steps } as BehaviorDoc)
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
        if (isStr(a.pose)) {
          notePose(a.pose, `${where}.arrival`)
          // v1 semantics restored (parity Stage 2c): no/zero revertMs leaves the
          // pose until the NEXT transition — strikePose {hold:'persist'} rides the
          // acting layer, the behavior completes, and the character stays
          // interactable in the pose (the legacy Fight swings its sword until you
          // navigate away). Authored revertMs stays a timed hold.
          if (isNum(a.revertMs) && a.revertMs > 0) {
            steps.push({ verb: 'strikePose', ref: mapPose(a.pose), holdMs: a.revertMs } as Intent)
          } else {
            steps.push({ verb: 'strikePose', ref: mapPose(a.pose), hold: 'persist' } as Intent)
          }
        }
        if (isStr(a.say)) steps.push({ verb: 'say', text: a.say } as Intent)
        if (isStr(a.sfx)) steps.push({ verb: 'sfx', kind: a.sfx } as Intent)
        if (isStr(a.setFlag) && !a.once) steps.push({ verb: 'setFlag', flag: a.setFlag } as Intent)
        if (a.face !== undefined) report.lossy.push(`${where}.arrival.face: dropped — facing follows the approach direction now`)
        if (a.flourish !== undefined) report.lossy.push(`${where}.arrival.flourish: dropped — squash/expression layers act arrivals now`)
        const doc: BehaviorDoc = { schemaVersion: 2, id, steps } as BehaviorDoc
        if (onceFlag) (doc as { when?: unknown }).when = { not: { flag: onceFlag } }
        addGenerated(id, doc)
        panel.arrival = { behaviorId: id }
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
    // v2 surface spots are roof|interior (closed — no silent grammar drift).
    if (side === 'top') return `travel:${panel}#roof`
    report.lossy.push(`${where}.to: v1 edge side ${JSON.stringify(side)} approximated as the roof spot`)
    return `travel:${panel}#roof`
  }
  report.lossy.push(`${where}.to: unmapped v1 target ${JSON.stringify(to)} → travel:to#interior`)
  return 'travel:to#interior'
}
