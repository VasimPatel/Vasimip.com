// Small shared helpers for the dev admin portal (geometry constants, flag
// aggregation, integer snapping). Kept framework-free so canvas + inspector +
// action editor can all lean on the same primitives.
import type { NotebookDoc } from '../notebook/doc/validate'
import type { PanelDoc } from '../notebook/doc/docTypes'
import type { PanelGeom } from '../notebook/types'

export const STAGE_W = 920
export const STAGE_H = 660
export const GRID = 8

/** Every `setFlag` / `showIfFlag` name in the doc → true, so the canvas renders
 *  flag-gated artwork while editing (nothing stays hidden behind a reveal). */
export function allFlagsOn(doc: NotebookDoc): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  for (const page of doc.pages) {
    for (const panel of page.panels) {
      if (panel.arrival?.setFlag) flags[panel.arrival.setFlag] = true
      for (const el of panel.elements) if (el.showIfFlag) flags[el.showIfFlag] = true
    }
  }
  return flags
}

export const round = (n: number): number => Math.round(n)
export const snap = (n: number, grid = GRID): number => Math.round(n / grid) * grid

/** Extract just the geometry fields a `PanelGeom` needs from a `PanelDoc`. */
export function toGeom(p: PanelDoc): PanelGeom {
  return { x: p.x, y: p.y, w: p.w, h: p.h, ax: p.ax, ay: p.ay }
}
