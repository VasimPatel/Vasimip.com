// Panel surfaces (L5 geometry) — Phase 6a. Pure, DOM-free, deterministic.
//
// A panel entity is transform + surface + collidable('segments'). The `surface`
// component stores only the axis-aligned box + the legacy anchor; THIS module
// derives the standable geometry from it (single source of truth = the box).
//
// ── the surface model (legacy mapping) ──────────────────────────────────────────
// SVG is y-DOWN (smaller y = higher on screen). The legacy notebook (Notebook.tsx
// geom(): ax=x+anchor.dx, ay=y+anchor.dy; anch(): feet stand AT (ax,ay)) gives two
// standable relationships, which we model as:
//   • roof    — the panel's TOP edge (y = box.y). Dash walks ON TOP of the panel
//               here ("roof spot", legacy topDy = A.y). A walkable line.
//   • floorIn — the INTERIOR standable line at ANCHOR height (y = box.y+anchor.dy),
//               spanning the box. Dash stands INSIDE the panel here ("interior
//               spot" = the authored anchor; legacy feet at ay). Chosen as the
//               anchor line, NOT the panel bottom, because the anchor is the
//               authored stand height and dy is often 0 (top) or deep (page1/3).
//   • wallL / wallR — the left / right edges (vertical segments).
// `spots` name the two canonical standable POINTS the traversal graph uses:
//   • interior = (box.x+anchor.dx, box.y+anchor.dy)   (the authored anchor)
//   • roof     = (box.x + box.w/2, box.y)             (top-centre)
// ROTATION IS PUNTED (6a): geometry is axis-aligned from box x/y/w/h; `transform.rot`
// / the legacy `rotate` field are ignored — legacy geom() ITSELF ignores rotate for
// locomotion (it maps only {x,y,w,h,anchor}; rotate is pure visual page-jitter), so
// axis-aligned surfaces match legacy behaviour. Real rotation lands in 6b/P9.

import type { Box, Segment, SurfaceComponent, Vec2 } from '@dash/schema'

export interface SurfaceGeometry {
  box: Box
  /** Top edge — the line Dash walks along on TOP of the panel. */
  roof: Segment
  /** Interior standable line at anchor height (inside the panel). */
  floorIn: Segment
  /** Left edge (vertical). */
  wallL: Segment
  /** Right edge (vertical). */
  wallR: Segment
  /** Bottom edge — completes the 4-wall enclosure (Wall Test). */
  bottom: Segment
  /** Canonical standable points, keyed by name. */
  spots: { interior: Vec2; roof: Vec2 }
}

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 })

/** The four physical box edges, in a stable order (top, right, bottom, left).
 * This is what a panel's `collidable.segments` holds — the mutable collision
 * boundary 6b cuts holes into. */
export function panelEdges(box: Box): Segment[] {
  const { x, y, w, h } = box
  return [
    seg(x, y, x + w, y), // 0 top / roof
    seg(x + w, y, x + w, y + h), // 1 right
    seg(x, y + h, x + w, y + h), // 2 bottom
    seg(x, y, x, y + h), // 3 left
  ]
}

/** Derive the full standable geometry from a `surface` component (pure). */
export function surfaceGeometry(surface: SurfaceComponent): SurfaceGeometry {
  const { box, anchor } = surface
  const { x, y, w, h } = box
  const fy = y + anchor.dy
  return {
    box,
    roof: seg(x, y, x + w, y),
    floorIn: seg(x, fy, x + w, fy),
    wallL: seg(x, y, x, y + h),
    wallR: seg(x + w, y, x + w, y + h),
    bottom: seg(x, y + h, x + w, y + h),
    spots: {
      interior: { x: x + anchor.dx, y: y + anchor.dy },
      roof: { x: x + w / 2, y },
    },
  }
}

/** Is a point inside a box's interior (inclusive edges)? */
export function pointInBox(px: number, py: number, box: Box): boolean {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h
}
