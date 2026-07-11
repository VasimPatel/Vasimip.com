// Migrations registry skeleton. No real migrations exist in Phase 1 — this is the
// mechanism the Phase 9 v1→v2 migration (and any future v2→v3 bump) will hang off.

import { CURRENT_SCHEMA_VERSION } from './envelope'

export type VersionedDoc = { schemaVersion: number } & Record<string, unknown>

/** Upgrades a doc from `fromVersion` to `fromVersion + 1` (must advance schemaVersion). */
export type MigrationFn = (doc: VersionedDoc) => VersionedDoc

const migrations = new Map<number, MigrationFn>()

export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  if (migrations.has(fromVersion)) {
    throw new Error(`migration from schemaVersion ${fromVersion} is already registered`)
  }
  migrations.set(fromVersion, fn)
}

/**
 * Apply registered migrations in sequence until the doc reaches
 * CURRENT_SCHEMA_VERSION. Returns the upgraded doc and the list of source
 * versions that were migrated through. Throws if a required migration is missing
 * or a migration fails to advance the version.
 */
export function migrateToCurrent(doc: VersionedDoc): { doc: VersionedDoc; applied: number[] } {
  let current = doc
  const applied: number[] = []
  const seen = new Set<number>()
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const from = current.schemaVersion
    if (seen.has(from)) throw new Error(`migration cycle detected at schemaVersion ${from}`)
    seen.add(from)
    const fn = migrations.get(from)
    if (!fn) {
      throw new Error(`no migration registered from schemaVersion ${from} toward ${CURRENT_SCHEMA_VERSION}`)
    }
    current = fn(current)
    if (current.schemaVersion <= from) {
      throw new Error(`migration from schemaVersion ${from} did not advance the version`)
    }
    applied.push(from)
  }
  return { doc: current, applied }
}
