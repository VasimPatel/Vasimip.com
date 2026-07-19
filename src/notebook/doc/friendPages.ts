// ─────────────────────────────────────────────────────────────────────────────
// THE GUESTBOOK — the growing friend pages at the end of the notebook.
//
// Model: pages flagged `guest: true` hold friend panels. Sides fill in reading
// order (sheet 1 front, sheet 1 back, sheet 2 front, …); a side is CLOSED once
// it holds FRIEND_MAX_PANELS panels (owner rule: a hard count, regardless of
// how much space they cover), and the book grows a new sheet when it runs out
// of open sides. A sheet's back only displays when
// the NEXT sheet exists (it's that spread's left page), so targeting a back
// materializes the following sheet too.
//
// `graftSubmission` is the ONE materializer — the friend builder's live preview
// AND the admin's approve-and-add both call it, so what a friend previews is
// exactly what approval produces (modulo submissions that land in between,
// which approval absorbs by recomputing the slot).
// ─────────────────────────────────────────────────────────────────────────────
import type { NotebookDoc, PageDoc, PanelDoc, ActionDoc } from './docTypes'
import type { FriendSubmission } from './submission'
import { PAGE_W, PAGE_H } from './spread'
import { TRICK_NAME_RE } from './submission'
import { MAX_PAGES } from './validate'

/** A guestbook side holds at most this many panels (the seed GUESTBOOK sign
 *  counts as one on a fresh sheet's front) — a hard count, independent of how
 *  much area the panels cover. */
export const FRIEND_MAX_PANELS = 4

export function sideOpen(panels: readonly PanelDoc[]): boolean {
  return panels.length < FRIEND_MAX_PANELS
}

export interface FriendSlot {
  /** Index of the guest page the next panel lands on, or null → a brand-new
   *  sheet must be appended (its front is the slot). */
  pageIdx: number | null
  side: 'front' | 'back'
  /** The slot is a back whose following sheet doesn't exist yet — approval
   *  appends one so the back has a spread to display on. */
  needsFollowingPage: boolean
}

/** Where the NEXT friend panel goes. */
export function nextFriendSlot(doc: NotebookDoc): FriendSlot {
  for (let i = 0; i < doc.pages.length; i++) {
    const pg = doc.pages[i]
    if (!pg.guest) continue
    if (sideOpen(pg.panels)) {
      return { pageIdx: i, side: 'front', needsFollowingPage: false }
    }
    if (sideOpen(pg.back?.panels ?? [])) {
      return { pageIdx: i, side: 'back', needsFollowingPage: i === doc.pages.length - 1 }
    }
  }
  return { pageIdx: null, side: 'front', needsFollowingPage: false }
}

/** The panels already on a slot's side (what the friend places around). */
export function slotPanels(doc: NotebookDoc, slot: FriendSlot): readonly PanelDoc[] {
  if (slot.pageIdx == null) return []
  const pg = doc.pages[slot.pageIdx]
  return slot.side === 'back' ? pg.back?.panels ?? [] : pg.panels
}

export function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap = 8): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

/** First non-overlapping in-bounds spot for a w×h panel on a side, scanning an
 *  8px grid from the requested point outward (row-major from top-left when no
 *  request). Returns null only when the side genuinely can't fit it. */
export function findSpot(existing: readonly PanelDoc[], w: number, h: number, want?: { x: number; y: number }): { x: number; y: number } | null {
  const fits = (x: number, y: number) =>
    x >= 0 && y >= 0 && x + w <= PAGE_W && y + h <= PAGE_H && !existing.some((p) => rectsOverlap({ x, y, w, h }, p))
  if (want) {
    const wx = Math.max(0, Math.min(Math.round(want.x), PAGE_W - w))
    const wy = Math.max(0, Math.min(Math.round(want.y), PAGE_H - h))
    if (fits(wx, wy)) return { x: wx, y: wy }
    // spiral out from the request in 24px rings
    for (let r = 24; r <= 480; r += 24) {
      for (let dy = -r; dy <= r; dy += 24) {
        for (let dx = -r; dx <= r; dx += 24) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          if (fits(wx + dx, wy + dy)) return { x: wx + dx, y: wy + dy }
        }
      }
    }
  }
  // 12px grid FROM ZERO plus the far-edge-flush candidates — a 24px grid
  // starting at 24 missed legal spots in tight bands (codex repro: a full-width
  // panel left a 124px bottom band findSpot couldn't see).
  const xs: number[] = []
  for (let x = 0; x + w <= PAGE_W; x += 12) xs.push(x)
  if (!xs.includes(PAGE_W - w)) xs.push(PAGE_W - w)
  const ys: number[] = []
  for (let y = 0; y + h <= PAGE_H; y += 12) ys.push(y)
  if (!ys.includes(PAGE_H - h)) ys.push(PAGE_H - h)
  for (const y of ys) {
    for (const x of xs) {
      if (fits(x, y)) return { x, y }
    }
  }
  return null
}

/** A fresh guestbook sheet (validator needs ≥1 panel — the corner sign doubles
 *  as the invitation). */
export function newGuestPage(n: number): PageDoc {
  return {
    name: n <= 1 ? 'FRIENDS' : `FRIENDS ${n}`,
    snark: 'they let ANYONE in here now.',
    guest: true,
    panels: [
      {
        x: 40, y: 40, w: 250, h: 130,
        anchor: { dx: 125, dy: 0 },
        rotate: -1,
        sketch: 'c',
        boxes: [
          { kind: 'text', x: 16, y: 12, w: 218, h: 22, text: 'THE GUESTBOOK', fam: 'marker', size: 17, hl: 'yellow' },
          { kind: 'text', x: 16, y: 44, w: 218, h: 70, text: 'friends draw themselves in.\npanels appear as they arrive.', fam: 'hand', size: 14 },
        ],
      },
    ],
  }
}

export interface GraftResult {
  doc: NotebookDoc
  pageIdx: number
  side: 'front' | 'back'
  panelIdx: number
  /** The action name the trick landed under (collision-suffixed), if any. */
  trickName: string | null
  /** The requested placement couldn't be honored exactly (nudged/rehomed). */
  nudged: boolean
}

/** Materialize a submission into a doc: grows guest sheets per the four-panel rule,
 *  places the panel (requested spot if it fits, nearest free spot otherwise),
 *  registers the trick under a collision-safe `friend-…` action name, and wires
 *  the panel's travel pool. Pure — returns a NEW doc. Returns null only when
 *  the panel can't fit anywhere on the slot side (callers may retry after the
 *  doc changes). */
export function graftSubmission(doc: NotebookDoc, sub: FriendSubmission, authorName?: string | null): GraftResult | null {
  let pages = [...doc.pages]
  let guestCount = pages.filter((p) => p.guest).length

  // Walk open sides in reading order until the panel actually FITS — a side
  // under the four-panel count can still refuse a large panel through
  // fragmentation, and "can't fit you" must mean "next side", never "rejected".
  let pageIdx = -1
  let side: 'front' | 'back' = 'front'
  let spot: { x: number; y: number } | null = null
  for (let i = 0; i < pages.length && !spot; i++) {
    const pg = pages[i]
    if (!pg.guest) continue
    if (sideOpen(pg.panels)) {
      spot = findSpot(pg.panels, sub.panel.w, sub.panel.h, sub.placement)
      if (spot) { pageIdx = i; side = 'front' }
    }
    if (!spot && sideOpen(pg.back?.panels ?? [])) {
      spot = findSpot(pg.back?.panels ?? [], sub.panel.w, sub.panel.h, sub.placement)
      if (spot && i === pages.length - 1 && pages.length >= MAX_PAGES) spot = null // no room for the display sheet
      if (spot) {
        pageIdx = i
        side = 'back'
        // a back displays as the NEXT spread's left page — materialize it
        if (i === pages.length - 1) pages = [...pages, newGuestPage(++guestCount)]
      }
    }
  }
  if (!spot) {
    // every open side refused → grow a fresh sheet (an empty page always fits) —
    // unless the book is at the validator's page cap (a graft must never
    // produce a doc the owner can't save).
    if (pages.length >= MAX_PAGES) return null
    pages = [...pages, newGuestPage(++guestCount)]
    pageIdx = pages.length - 1
    side = 'front'
    spot = findSpot(pages[pageIdx].panels, sub.panel.w, sub.panel.h, sub.placement)
    if (!spot) return null // unreachable for validated panel sizes; typed honestly
  }
  const basePage = pages[pageIdx]
  const nudged = !!sub.placement && (spot.x !== Math.round(sub.placement.x) || spot.y !== Math.round(sub.placement.y))

  // Trick: register under a collision-safe name; keep the friend's slug visible.
  let trickName: string | null = null
  let actions = doc.actions
  if (sub.trick && TRICK_NAME_RE.test(sub.trick.name)) {
    const existingNames = new Set(Object.keys(doc.actions ?? {}))
    let name = `friend-${sub.trick.name}`
    for (let i = 2; existingNames.has(name); i++) name = `friend-${sub.trick.name}-${i}`
    trickName = name
    const action: ActionDoc = { steps: sub.trick.steps }
    actions = { ...(doc.actions ?? {}), [name]: action }
  }

  const panel: PanelDoc = {
    x: spot.x,
    y: spot.y,
    w: sub.panel.w,
    h: sub.panel.h,
    anchor: { dx: Math.round(sub.panel.w / 2), dy: 0 },
    sketch: 'b',
    ...(authorName ? { pid: `by ${authorName}`.slice(0, 24) } : {}),
    // Dash AT the panel — the friend's closed-set arrival (pose/say/face only;
    // once/setFlag/sfx never come from submissions).
    ...(sub.arrival && Object.keys(sub.arrival).length > 0
      ? {
          arrival: {
            ...(sub.arrival.pose ? { pose: sub.arrival.pose } : {}),
            ...(sub.arrival.say ? { say: sub.arrival.say } : {}),
            ...(sub.arrival.face ? { face: sub.arrival.face } : {}),
            ...(sub.arrival.pose ? { revertMs: 2400 } : {}),
          },
        }
      : {}),
    boxes: sub.panel.boxes,
    ...(sub.travel || trickName
      ? {
          travel: {
            ...(sub.travel ? { builtins: sub.travel } : {}),
            ...(trickName ? { actions: [trickName], actionWeight: 2 } : {}),
          },
        }
      : {}),
  }

  const nextPage: PageDoc =
    side === 'back'
      ? { ...basePage, back: { panels: [...(basePage.back?.panels ?? []), panel] } }
      : { ...basePage, panels: [...basePage.panels, panel] }
  pages = pages.map((p, i) => (i === pageIdx ? nextPage : p))

  return {
    doc: { ...doc, pages, ...(actions !== doc.actions ? { actions } : {}) },
    pageIdx,
    side,
    panelIdx: side === 'back' ? (nextPage.back?.panels.length ?? 1) - 1 : nextPage.panels.length - 1,
    trickName,
    nudged,
  }
}
