// worldFromNotebook — pure data transform from the LEGACY notebook doc's panel
// geometry into real WorldDocV2s (Phase 6a). Used by tests + the future P9
// migration; NEVER imported by src/ (the live site keeps the legacy engine until
// P9).
//
// PAGE SCOPING (documented choice): the notebook's pages are SEPARATE spaces — the
// site mounts one page at a time, Dash travels WITHIN a page, and a page change is
// a flip (a P7 behavior/camera concern, never a traversal edge). So this returns
// ONE WorldDocV2 PER PAGE, each in its own coordinate space, rather than one
// flattened doc; a traversal graph built from a page world has zero inter-page
// edges BY CONSTRUCTION. Entity ids stay globally unique (`panel:<page>:<j>`) so
// goldens and admin-style P·0N references remain unambiguous across pages.
//
// Rotation is carried into `meta` (render-layer) but NOT into geometry — 6a
// surfaces are axis-aligned (see surfaces.ts). Panel content (boxes/sketch/arrival)
// rides on `meta`, which the engine never reads.

import type { EntityDoc, WorldDocV2 } from '@dash/schema'
import { panelEdges } from './surfaces'

export interface NotebookPanelInput {
  x: number
  y: number
  w: number
  h: number
  anchor: { dx: number; dy: number }
  rotate?: number
  [k: string]: unknown
}
export interface NotebookPageInput {
  name: string
  panels: NotebookPanelInput[]
  [k: string]: unknown
}

/** One notebook page as a self-contained world (its own coordinate space). */
export interface PageWorld {
  pageIndex: number
  name: string
  world: WorldDocV2
}

export function worldFromNotebook(pages: readonly NotebookPageInput[], opts?: { seed?: number }): PageWorld[] {
  return pages.map((page, pi) => {
    const entities: EntityDoc[] = page.panels.map((pn, j) => {
      const box = { x: pn.x, y: pn.y, w: pn.w, h: pn.h }
      return {
        id: `panel:${pi}:${j}`,
        components: {
          transform: { x: pn.x, y: pn.y },
          surface: { box, anchor: { dx: pn.anchor.dx, dy: pn.anchor.dy } },
          collidable: { shape: 'segments' as const, segments: panelEdges(box) },
        },
        // Render-layer payload the engine ignores; `rotate` recorded but unused by 6a.
        meta: { page: page.name, pageIndex: pi, panelIndex: j, rotate: pn.rotate ?? 0, boxes: pn.boxes, sketch: pn.sketch, arrival: pn.arrival },
      }
    })
    return { pageIndex: pi, name: page.name, world: { schemaVersion: 2, seed: opts?.seed ?? 1, entities } }
  })
}
