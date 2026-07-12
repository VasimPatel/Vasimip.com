// The P9 migration against the REAL live notebook doc — the round-trip gate's
// first half (worldFromNotebook + site mount land in 9b).
import { test, expect } from 'bun:test'
import { migrateNotebookV1, tryValidateNotebookV2, type MigrationBase } from '../src/index'
import notebook from '../../../src/notebook/notebook.json'
import rig from '../../../content/engine/rig.dash.json'
import character from '../../../content/engine/character.dash.json'
import stand from '../../../content/engine/poses/stand.json'
import cheer from '../../../content/engine/poses/cheer.json'
import think from '../../../content/engine/poses/think.json'
import walkMid from '../../../content/engine/poses/walk-mid.json'
import tuck from '../../../content/engine/poses/jump-tuck.json'
import squash from '../../../content/engine/poses/squash-land.json'
import idleClip from '../../../content/engine/clips/idle-shuffle.json'
import walkClip from '../../../content/engine/clips/walk-cycle.json'
import jumpClip from '../../../content/engine/clips/jump.json'
import hopB from '../../../content/engine/behaviors/hop.json'
import vaultB from '../../../content/engine/behaviors/vault.json'
import tightropeB from '../../../content/engine/behaviors/tightrope.json'

function base(): MigrationBase {
  return {
    rigs: { dash: rig as never },
    characters: { dash: character as never },
    poses: {
      stand: stand as never, cheer: cheer as never, think: think as never,
      'walk-mid': walkMid as never, 'jump-tuck': tuck as never, 'squash-land': squash as never,
    },
    clips: { 'idle-shuffle': idleClip as never, 'walk-cycle': walkClip as never, jump: jumpClip as never },
    behaviors: { 'builtin:hop': { ...(hopB as object), id: 'builtin:hop' } as never,
      'builtin:vault': { ...(vaultB as object), id: 'builtin:vault' } as never,
      'act:tightrope-authored': { ...(tightropeB as object), id: 'act:tightrope-authored' } as never },
  }
}

test('migrates the live notebook.json: structure, arrivals, travel, report', () => {
  const { doc, report } = migrateNotebookV1(notebook, base())

  // Owner content preserved byte-identically at the render layer.
  expect(doc.pages.length).toBe(5)
  expect(doc.cover).toEqual((notebook as { cover: unknown }).cover)
  expect(doc.pages[0].panels[0].boxes).toEqual((notebook as never as { pages: { panels: { boxes: unknown }[] }[] }).pages[0].panels[0].boxes)

  // The owner's own arrivals became behaviors ("HELLO THERE" and friends).
  const hello = doc.behaviors['arrival:p0:i0']
  expect(hello.steps.some((s) => s.verb === 'say' && (s as { text: string }).text === 'HELLO THERE')).toBe(true)
  expect(doc.pages[0].panels[0].arrival?.behaviorId).toBe('arrival:p0:i0')

  // once-arrivals gate on their flag (skills spray).
  const spray = doc.behaviors['arrival:p3:i0']
  expect(spray.when).toEqual({ not: { flag: 'skillsRevealed' } })
  expect(spray.steps[0]).toEqual({ verb: 'setFlag', flag: 'skillsRevealed' })

  // The tightrope travel pool references act:tightrope with weight 2.
  const workPanel = doc.pages[2].panels[1]
  expect(workPanel.travel?.pool.some((e) => e.behaviorId === 'act:tightrope' && e.weight === 2)).toBe(true)
  // Custom action migrated with contextual travel targets.
  const rope = doc.behaviors['act:tightrope']
  expect(rope.steps.some((s) => s.verb === 'moveTo' && String((s as { target: string }).target).startsWith('travel:'))).toBe(true)

  // The report is the authoring checklist: legacy poses not yet authored.
  expect(report.missingPoses).toContain('fight')
  expect(report.missingPoses).toContain('spray')
  expect(report.missingPoses).toContain('rope')
  // Builtins not yet authored are named too.
  expect(report.missingBehaviors).toContain('builtin:walk')

  // The migrated doc validates once the missing content exists — for now assert
  // the validator pinpoints EXACTLY the known-missing references, nothing else.
  const v = tryValidateNotebookV2(doc)
  expect(v.ok).toBe(false)
  if (!v.ok) {
    for (const e of v.errors) {
      expect(/unknown behavior|behaviors\.|poses\./.test(e)).toBe(true)
    }
  }
})

test('deterministic: migrating twice yields identical docs and reports', () => {
  const a = migrateNotebookV1(notebook, base())
  const b = migrateNotebookV1(notebook, base())
  expect(JSON.stringify(a.doc)).toBe(JSON.stringify(b.doc))
  expect(a.report).toEqual(b.report)
})
