import { test, expect } from 'bun:test'
import { surfaceGeometry, panelEdges, pointInBox } from '../src/world/surfaces'
import type { SurfaceComponent } from '@dash/schema'

const surf: SurfaceComponent = { box: { x: 100, y: 50, w: 200, h: 120 }, anchor: { dx: 80, dy: 0 } }

test('surface geometry maps the legacy anchor model (roof=top edge, interior=anchor)', () => {
  const g = surfaceGeometry(surf)
  // roof = top edge (SVG y-down: min y). Dash walks ON TOP here.
  expect(g.roof).toEqual({ x1: 100, y1: 50, x2: 300, y2: 50 })
  // interior standable line at anchor height (dy=0 ⇒ coincides with the top line).
  expect(g.floorIn).toEqual({ x1: 100, y1: 50, x2: 300, y2: 50 })
  // walls = side edges.
  expect(g.wallL).toEqual({ x1: 100, y1: 50, x2: 100, y2: 170 })
  expect(g.wallR).toEqual({ x1: 300, y1: 50, x2: 300, y2: 170 })
  expect(g.bottom).toEqual({ x1: 100, y1: 170, x2: 300, y2: 170 })
  // spots: interior = anchor (box.x+dx, box.y+dy); roof = top-centre.
  expect(g.spots.interior).toEqual({ x: 180, y: 50 })
  expect(g.spots.roof).toEqual({ x: 200, y: 50 })
})

test('interior line sits at anchor DEPTH when dy>0 (page1/3 deep-anchor panels)', () => {
  const g = surfaceGeometry({ box: { x: 0, y: 0, w: 100, h: 300 }, anchor: { dx: 50, dy: 250 } })
  expect(g.floorIn.y1).toBe(250)
  expect(g.spots.interior).toEqual({ x: 50, y: 250 })
  // roof is still the top edge regardless of the interior depth.
  expect(g.spots.roof).toEqual({ x: 50, y: 0 })
})

test('panelEdges are the 4 box edges in stable order (top,right,bottom,left)', () => {
  const e = panelEdges({ x: 0, y: 0, w: 10, h: 20 })
  expect(e).toHaveLength(4)
  expect(e[0]).toEqual({ x1: 0, y1: 0, x2: 10, y2: 0 })
  expect(e[3]).toEqual({ x1: 0, y1: 0, x2: 0, y2: 20 })
})

test('pointInBox is inclusive on the boundary', () => {
  const b = { x: 0, y: 0, w: 10, h: 10 }
  expect(pointInBox(5, 5, b)).toBe(true)
  expect(pointInBox(0, 5, b)).toBe(true) // on the edge
  expect(pointInBox(-0.001, 5, b)).toBe(false)
})
