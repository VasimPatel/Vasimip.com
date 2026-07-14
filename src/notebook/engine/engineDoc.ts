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
import { spreadPages } from '../doc/spread'
import type { NotebookDoc } from '../doc/docTypes'

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

import skinKeyframes from '../../../content/engine/skins/keyframes.json'
import sStand from '../../../content/engine/skins/stand.json'
import sWalk from '../../../content/engine/skins/walk-mid.json'
import sTuck from '../../../content/engine/skins/jump-tuck.json'
import sLand from '../../../content/engine/skins/squash-land.json'
import sFight from '../../../content/engine/skins/fight.json'
import sSpray from '../../../content/engine/skins/spray.json'
import sThink from '../../../content/engine/skins/think.json'
import sVault from '../../../content/engine/skins/vault.json'
import sRope from '../../../content/engine/skins/rope.json'
import sSwing from '../../../content/engine/skins/swing.json'
import sWallrun from '../../../content/engine/skins/wallrun.json'
import sSlide from '../../../content/engine/skins/slide.json'
import sSurf from '../../../content/engine/skins/surf.json'
import sDangle from '../../../content/engine/skins/dangle.json'
import sThrow from '../../../content/engine/skins/throw.json'
import sWave from '../../../content/engine/skins/wave.json'
import sCheer from '../../../content/engine/skins/cheer.json'
import sTrip from '../../../content/engine/skins/trip.json'
import sSneeze from '../../../content/engine/skins/sneeze.json'
import sShove from '../../../content/engine/skins/shove.json'
import sPunch from '../../../content/engine/skins/punch.json'
import sPeek from '../../../content/engine/skins/peek.json'
import sHang from '../../../content/engine/skins/hang.json'
import sKnock from '../../../content/engine/skins/knock.json'

import bWalk from '../../../content/engine/behaviors/builtin/walk.json'
import bHop from '../../../content/engine/behaviors/builtin/hop.json'
import bRoll from '../../../content/engine/behaviors/builtin/roll.json'
import bPoof from '../../../content/engine/behaviors/builtin/poof.json'
import bVault from '../../../content/engine/behaviors/builtin/vault.json'
import bVaultPeek from '../../../content/engine/behaviors/builtin/vault-peek.json'
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
  behaviors: reg([bWalk, bHop, bRoll, bPoof, bVault, bVaultPeek, bRope, bSwing, bWallrun, bSlide, bSmash, bCombo]),
}

// Expressive data skins (parity Stage 2b) — render-layer content, NOT part of
// the migration base (the sim never sees them). One frozen registry.
import type { PoseSkinDoc, SkinKeyframe } from '../../../packages/schema/src/index'
export const engineSkins: { keyframes: Record<string, SkinKeyframe>; docs: readonly PoseSkinDoc[] } = {
  keyframes: (skinKeyframes as unknown as { keyframes: Record<string, SkinKeyframe> }).keyframes,
  docs: [
    sStand, sWalk, sTuck, sLand, sFight, sSpray, sThink, sVault, sRope, sSwing,
    sWallrun, sSlide, sSurf, sDangle, sThrow, sWave, sCheer, sTrip, sSneeze,
    sShove, sPunch, sPeek, sHang, sKnock,
  ] as unknown as PoseSkinDoc[],
}

export interface EngineDoc {
  docV2: NotebookDocV2
  pageWorlds: PageWorld[]
}

// The site HOT-SWAPS its document (server fetch / admin preview) — the engine must
// simulate the SAME doc the site renders (review blocker: baked-doc singleton
// desynced sim from render). Memoized on v1-doc identity: cheap re-migration only
// when the document actually changes.
let cache: { v1: unknown; built: EngineDoc } | null = null

export function buildEngineDoc(v1doc: unknown): EngineDoc {
  if (cache && cache.v1 === v1doc) return cache.built
  // Two-sided book: fold each view's LEFT page (the previous sheet's back)
  // into flat SPREAD pages with stage-placed panels BEFORE migration — the
  // engine world, arrivals, and travel pools then treat a spread exactly as
  // they treated a page (same mapping geom() uses; the routes always agree).
  const v1 = v1doc as NotebookDoc
  const spread = { ...v1, pages: spreadPages(v1) }
  const { doc, report } = migrateNotebookV1(spread, base)
  const built: EngineDoc = { docV2: doc, pageWorlds: worldFromNotebook(doc.pages as never) }
  cache = { v1: v1doc, built }
  if (import.meta.env.DEV && report.lossy.length > 0) {
    // eslint-disable-next-line no-console
    console.info('[engine] migration notes:', report.lossy)
  }
  return built
}

/** The baked fallback (what the site paints before the server doc arrives). */
export const bakedEngineDoc: EngineDoc = buildEngineDoc(notebookV1)
