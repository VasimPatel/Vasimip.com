// Engine-mode document (P9b) — the site migrates the v1 notebook doc IN MEMORY at
// module load and mounts the engine on the result. Storage stays v1 until the 9c
// cutover: notebook.json / the DB remain the single source of truth, and legacy
// mode keeps working from the same file.
//
// Relative package imports (like the dev harness pages) so Vite + the site
// tsconfig resolve them without path mapping; the engine is DOM-free so it
// compiles fine inside the DOM-lib site program.

import { migrateNotebookV1, type MigrationBase, type NotebookDocV2 } from '../../../packages/schema/src/index'
import { worldFromNotebook, type PageWorld } from '../../../packages/engine/src/index'
import notebookV1 from '../notebook.json'

import rig from '../../../content/engine/rig.dash.json'
import character from '../../../content/engine/character.dash.json'
import idleClip from '../../../content/engine/clips/idle-shuffle.json'
import walkClip from '../../../content/engine/clips/walk-cycle.json'
import jumpClip from '../../../content/engine/clips/jump.json'

import standPose from '../../../content/engine/poses/stand.json'
import walkMid from '../../../content/engine/poses/walk-mid.json'
import jumpTuck from '../../../content/engine/poses/jump-tuck.json'
import cheer from '../../../content/engine/poses/cheer.json'
import think from '../../../content/engine/poses/think.json'
import squashLand from '../../../content/engine/poses/squash-land.json'
import fight from '../../../content/engine/poses/fight.json'
import spray from '../../../content/engine/poses/spray.json'
import dangle from '../../../content/engine/poses/dangle.json'
import throwPose from '../../../content/engine/poses/throw.json'
import wave from '../../../content/engine/poses/wave.json'
import trip from '../../../content/engine/poses/trip.json'
import sneeze from '../../../content/engine/poses/sneeze.json'
import vault from '../../../content/engine/poses/vault.json'
import wallrun from '../../../content/engine/poses/wallrun.json'
import rope from '../../../content/engine/poses/rope.json'
import swing from '../../../content/engine/poses/swing.json'
import slide from '../../../content/engine/poses/slide.json'
import surf from '../../../content/engine/poses/surf.json'
import shove from '../../../content/engine/poses/shove.json'
import punch from '../../../content/engine/poses/punch.json'
import peek from '../../../content/engine/poses/peek.json'
import hang from '../../../content/engine/poses/hang.json'
import knock from '../../../content/engine/poses/knock.json'

import bWalk from '../../../content/engine/behaviors/builtin/walk.json'
import bHop from '../../../content/engine/behaviors/builtin/hop.json'
import bRoll from '../../../content/engine/behaviors/builtin/roll.json'
import bPoof from '../../../content/engine/behaviors/builtin/poof.json'
import bVault from '../../../content/engine/behaviors/builtin/vault.json'
import bRope from '../../../content/engine/behaviors/builtin/rope.json'
import bSwing from '../../../content/engine/behaviors/builtin/swing.json'
import bWallrun from '../../../content/engine/behaviors/builtin/wallrun.json'
import bSlide from '../../../content/engine/behaviors/builtin/slide.json'
import bSmash from '../../../content/engine/behaviors/builtin/smash.json'
import bCombo from '../../../content/engine/behaviors/builtin/combo.json'

type J = never

function reg<T extends { id: string }>(docs: unknown[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const d of docs as (T & { id: string })[]) out[d.id] = d
  return out
}

const base: MigrationBase = {
  rigs: { dash: rig as J },
  characters: { dash: character as J },
  poses: reg([
    standPose, walkMid, jumpTuck, cheer, think, squashLand, fight, spray, dangle,
    throwPose, wave, trip, sneeze, vault, wallrun, rope, swing, slide, surf, shove,
    punch, peek, hang, knock,
  ]),
  clips: reg([idleClip, walkClip, jumpClip]),
  behaviors: reg([bWalk, bHop, bRoll, bPoof, bVault, bRope, bSwing, bWallrun, bSlide, bSmash, bCombo]),
}

const migrated = migrateNotebookV1(notebookV1, base)

/** The migrated v2 doc the engine mounts on (in-memory; storage stays v1). */
export const docV2: NotebookDocV2 = migrated.doc
/** Lossy-conversion report — dev-logged so approximations stay visible. */
export const migrationReport = migrated.report
/** Per-page engine worlds (page coordinates == world coordinates). */
export const pageWorlds: PageWorld[] = worldFromNotebook(docV2.pages as never)

if (import.meta.env.DEV && migrationReport.lossy.length > 0) {
  // eslint-disable-next-line no-console
  console.info('[engine] migration notes:', migrationReport.lossy)
}
