// The two-sided book (spread view): the open notebook shows a LEFT page (the
// previous sheet's BACK) and a RIGHT page (the current sheet's front) around a
// center binding. This module is the SINGLE mapping from authored page space
// (each side 0..920) to stage coordinates — consumed by Notebook.geom() (the
// legacy/nav geometry) AND buildEngineDoc (the engine world/migration input),
// so both routes always agree about where a panel is.
import type { NotebookDoc, PageDoc, PanelDoc } from './docTypes'

export const PAGE_W = 920
export const PAGE_H = 660
/** The right page's origin — also the binding hinge sheets rotate about. */
export const SPREAD_RIGHT_X = 934
/** Where a flipped sheet's back lands: rotateY(−180°) about x=SPREAD_RIGHT_X
 * maps the sheet [934..1854] onto [14..934]. */
export const SPREAD_LEFT_X = SPREAD_RIGHT_X - PAGE_W
export const STAGE_W = SPREAD_RIGHT_X + PAGE_W
export const STAGE_H = PAGE_H

/** The LEFT page of view page p (1-based; 0 = cover): the back of the previous
 * sheet. Spread 1's left page is the cover lining — never has panels. */
export function leftPagePanels(pages: readonly PageDoc[], p: number): PanelDoc[] {
  return (p >= 2 ? pages[p - 2]?.back?.panels : undefined) ?? []
}

/** A panel placed into stage coordinates for its side of the spread. */
export function placePanel(pn: PanelDoc, side: 'L' | 'R'): PanelDoc {
  return { ...pn, x: pn.x + (side === 'L' ? SPREAD_LEFT_X : SPREAD_RIGHT_X) }
}

/** The whole doc as flat SPREADS: view page p's panels = placed left-page
 * panels then placed right-page panels (nav order = reading order). Backs are
 * folded in, so consumers (geometry, engine migration) never see `back`. */
export function spreadPages(doc: NotebookDoc): PageDoc[] {
  return doc.pages.map((pg, i) => {
    const flat: PageDoc = {
      ...pg,
      panels: [
        ...leftPagePanels(doc.pages, i + 1).map((pn) => placePanel(pn, 'L')),
        ...pg.panels.map((pn) => placePanel(pn, 'R')),
      ],
    }
    delete (flat as { back?: unknown }).back
    return flat
  })
}
