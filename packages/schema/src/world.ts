// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 PLACEHOLDER — do not build on this.
//
// A deliberately tiny world doc whose ONLY purpose is to give the Phase 1 sim
// loop some entities to move so the loop/RNG/events/hash can be exercised end to
// end. Phase 2 (rig & poses) and Phase 6 (the real typed-component ECS WorldDoc,
// see ENGINE_V2 §5) REPLACE this type wholesale. Keep it honest and minimal — no
// components, no geometry, no closed-set verbs here.
// ─────────────────────────────────────────────────────────────────────────────

import { CURRENT_SCHEMA_VERSION, type DocEnvelope } from './envelope'
import { tryValidate, isRecord, isNum, isStr, isArr, type ValidateResult, type Issues } from './validate'

export interface WorldEntityV2 {
  id: string
  x: number
  y: number
}

export interface WorldDocV2 extends DocEnvelope {
  seed: number
  entities: WorldEntityV2[]
}

function checkEntities(x: unknown, issues: Issues): void {
  if (!isArr(x)) {
    issues.push('entities: required array')
    return
  }
  const ids = new Set<string>()
  x.forEach((e, i) => {
    const path = `entities[${i}]`
    if (!isRecord(e)) {
      issues.push(`${path}: must be an object`)
      return
    }
    if (!isStr(e.id) || e.id.length === 0) issues.push(`${path}.id: required non-empty string`)
    else if (ids.has(e.id)) issues.push(`${path}.id: duplicate id ${JSON.stringify(e.id)}`)
    else ids.add(e.id)
    if (!isNum(e.x)) issues.push(`${path}.x: required finite number`)
    if (!isNum(e.y)) issues.push(`${path}.y: required finite number`)
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
    },
  ])
}
