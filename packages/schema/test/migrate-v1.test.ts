// The P9 migration against the REAL live notebook doc — with the COMPLETE content
// base (all 24 poses, all 11 builtins), the round-trip must validate CLEAN.
import { test, expect } from 'bun:test'
import { readdirSync } from 'node:fs'
import { migrateNotebookV1, tryValidateNotebookV2, type MigrationBase } from '../src/index'
import notebook from '../../../src/notebook/notebook.json'
import rig from '../../../content/engine/rig.dash.json'
import character from '../../../content/engine/character.dash.json'
import idleClip from '../../../content/engine/clips/idle-shuffle.json'
import walkClip from '../../../content/engine/clips/walk-cycle.json'
import jumpClip from '../../../content/engine/clips/jump.json'

const ROOT = new URL('../../../', import.meta.url).pathname

async function loadDir<T>(dir: string): Promise<Record<string, T>> {
  const out: Record<string, T> = {}
  for (const f of readdirSync(ROOT + dir).filter((f) => f.endsWith('.json'))) {
    const doc = (await import(ROOT + dir + '/' + f)) as { default: T & { id: string } }
    out[doc.default.id] = doc.default
  }
  return out
}

async function base(): Promise<MigrationBase> {
  return {
    rigs: { dash: rig as never },
    characters: { dash: character as never },
    poses: await loadDir('content/engine/poses'),
    clips: { 'idle-shuffle': idleClip as never, 'walk-cycle': walkClip as never, jump: jumpClip as never },
    behaviors: await loadDir('content/engine/behaviors/builtin'),
  }
}

test('THE 9a ROUND-TRIP: live notebook.json migrates CLEAN with the full base', async () => {
  const { doc, report } = migrateNotebookV1(notebook, await base())

  // Nothing missing anymore — the content set is complete.
  expect(report.missingPoses).toEqual([])
  expect(report.missingBehaviors).toEqual([])

  // Owner content preserved byte-identically at the render layer.
  expect(doc.pages.length).toBe(5)
  expect(doc.cover).toEqual((notebook as { cover: unknown }).cover)
  expect(doc.pages[0].panels[0].boxes).toEqual(
    (notebook as never as { pages: { panels: { boxes: unknown }[] }[] }).pages[0].panels[0].boxes,
  )

  // The owner's arrivals as behaviors.
  const hello = doc.behaviors['arrival:p0:i0']
  expect(hello.steps.some((s) => s.verb === 'say' && (s as { text: string }).text === 'HELLO THERE')).toBe(true)
  const spray = doc.behaviors['arrival:p3:i0']
  expect(spray.when).toEqual({ not: { flag: 'skillsRevealed' } })

  // Travel pool: tightrope weighted 2 beside the full builtin pool.
  const workPanel = doc.pages[2].panels[1]
  expect(workPanel.travel?.pool.some((e) => e.behaviorId === 'act:tightrope' && e.weight === 2)).toBe(true)
  expect(workPanel.travel?.pool.some((e) => e.behaviorId === 'builtin:walk')).toBe(true)

  // Contextual travel targets in the migrated custom action.
  const rope = doc.behaviors['act:tightrope']
  expect(rope.steps.some((s) => s.verb === 'moveTo' && String((s as { target: string }).target).startsWith('travel:'))).toBe(true)

  // THE GATE: the migrated doc validates CLEAN.
  const v = tryValidateNotebookV2(doc)
  if (!v.ok) console.log('errors:', v.errors.slice(0, 8))
  expect(v.ok).toBe(true)

  // Report is small and every note is an EXPECTED approximation class.
  for (const note of report.lossy) {
    expect(/face|flourish|ease\/speed|geometric gate|fx /.test(note)).toBe(true)
  }
})

test('deterministic: migrating twice yields identical docs and reports', async () => {
  const b = await base()
  const a1 = migrateNotebookV1(notebook, b)
  const a2 = migrateNotebookV1(notebook, b)
  expect(JSON.stringify(a1.doc)).toBe(JSON.stringify(a2.doc))
  expect(a1.report).toEqual(a2.report)
})
