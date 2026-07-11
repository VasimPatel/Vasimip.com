import { test, expect } from 'bun:test'
import {
  sweptCapsuleVsSegment,
  sweptPointVsSegments,
  buildCollisionWorld,
  isEnclosed,
  nearestSurface,
  createContactTracker,
  slideAlong,
  reflect,
  stopAt,
  type Capsule,
  type SegmentRef,
  type Contact,
} from '../src/world/collision'
import type { WorldDocV2 } from '@dash/schema'

// A vertical wall at x=0 spanning y∈[-100,100].
const WALL = { x1: 0, y1: -100, x2: 0, y2: 100 }
const R = 10

// A small (near-point) vertical capsule core translating by (dx,dy).
const cap = (cx: number, cy: number): Capsule => ({ x0: cx, y0: cy - 4, x1: cx, y1: cy + 4, r: R })

// ── THE NO-TUNNELLING GATE ────────────────────────────────────────────────────────
// Fire the capsule at the wall at extreme velocity from many angles/offsets. A hit
// must be found whenever the swept path crosses the wall band; never a pass-through.
test('GATE: no tunnelling — extreme-velocity capsule always hits when its path crosses the wall', () => {
  // 10 000 px/s is the gate speed; we sweep a SINGLE call spanning up to 2000 px
  // (≈ 240 000 px/s-equivalent for one 1/120 s tick) so tunnelling is impossible to
  // hide. Multiple crossing directions + offsets along the wall span.
  const speeds = [2000, 240, 83.33] // 2000px single-step; 10k px/s → 83.33px/tick
  let crossings = 0
  for (const span of speeds) {
    for (let ay = -90; ay <= 90; ay += 30) {
      for (const dir of [1, -1]) {
        // start on one side, aim straight across to the other
        const startX = -dir * (span / 2)
        const c = cap(startX, ay)
        const hit = sweptCapsuleVsSegment(c, dir * span, 0, WALL)
        expect(hit).not.toBeNull()
        if (hit) {
          expect(hit.t).toBeGreaterThanOrEqual(0)
          expect(hit.t).toBeLessThanOrEqual(1)
          // normal points back toward the mover (−dir on x)
          expect(Math.sign(hit.nx)).toBe(-dir)
          crossings++
        }
      }
    }
  }
  console.log(`[no-tunnel gate] ${crossings} extreme-velocity crossings, all hit; speeds(px/step)=${speeds.join(',')}`)
})

test('GATE: corner graze at the wall endpoint is caught', () => {
  // aim across the wall exactly at its top endpoint (0,100)
  const c = cap(-500, 100)
  const hit = sweptCapsuleVsSegment(c, 1000, 0, WALL)
  expect(hit).not.toBeNull()
})

test('GATE: parallel-to-wall motion beyond r does NOT hit (no false positive)', () => {
  const c = cap(-50, -100) // 50px left of the wall
  const hit = sweptCapsuleVsSegment(c, 0, 200, WALL) // straight down, parallel
  expect(hit).toBeNull()
})

test('GATE: parallel motion grazing within r along the span reports contact', () => {
  const c = cap(-R + 1, -50) // 9px left → within radius 10 of the wall
  const hit = sweptCapsuleVsSegment(c, 0, 40, WALL)
  expect(hit).not.toBeNull()
})

test('GATE: degenerate — motion starting exactly ON the segment', () => {
  const c = cap(0, 0) // core centred on the wall
  const hit = sweptCapsuleVsSegment(c, 100, 0, WALL)
  expect(hit).not.toBeNull()
  if (hit) expect(hit.t).toBeLessThan(0.001)
})

test('TOI value is exact for a head-on horizontal sweep', () => {
  const c = cap(-1000, 0)
  const hit = sweptCapsuleVsSegment(c, 2000, 0, WALL)
  // contact when the capsule LEFT edge (centre − r) reaches x=0 ⇒ centre at −10.
  // t = (−10 − (−1000)) / 2000 = 0.495
  expect(hit?.t).toBeCloseTo(0.495, 5)
  expect(hit?.nx).toBeCloseTo(-1, 5)
})

// ── point-vs-segments (r=0) ─────────────────────────────────────────────────────
test('swept point crosses a segment mid-span', () => {
  const segs: SegmentRef[] = [{ seg: WALL, entity: 'w', segIndex: 0 }]
  const hit = sweptPointVsSegments(-10, 0, 0, 20, 0, segs)
  expect(hit).not.toBeNull()
  expect(hit?.t).toBeCloseTo(0.5, 6)
})

// ── resolution primitives (unwired) ──────────────────────────────────────────────
test('resolution primitives: slideAlong / reflect / stopAt', () => {
  // moving right-down into a vertical wall (normal −x)
  const s = slideAlong(5, 3, -1, 0)
  expect(s).toEqual({ vx: 0, vy: 3 }) // x killed, y kept
  const r = reflect(5, 3, -1, 0, 1)
  expect(r.vx).toBeCloseTo(-5, 6)
  expect(r.vy).toBeCloseTo(3, 6)
  const p = stopAt(0, 0, 100, 0, 0.5, 0)
  expect(p).toEqual({ x: 50, y: 0 })
})

// ── enclosed / nearestSurface (Wall Test query level) ────────────────────────────
function onePanelWorld(fullyWalled = true): WorldDocV2 {
  const box = { x: 0, y: 0, w: 100, h: 100 }
  const edges = [
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x1: 100, y1: 0, x2: 100, y2: 100 },
    { x1: 0, y1: 100, x2: 100, y2: 100 },
    { x1: 0, y1: 0, x2: 0, y2: 100 },
  ]
  return {
    schemaVersion: 2,
    seed: 1,
    entities: [
      {
        id: 'panel',
        components: {
          surface: { box, anchor: { dx: 50, dy: 0 } },
          collidable: { shape: 'segments', segments: fullyWalled ? edges : edges.slice(0, 3) /* drop the left wall */ },
        },
      },
    ],
  }
}

test('WALL TEST (query level): enclosed inside 4 solid walls; outside → false', () => {
  const cw = buildCollisionWorld(onePanelWorld(true))
  expect(isEnclosed(50, 50, cw)).toBe(true) // enclosed
  expect(isEnclosed(200, 200, cw)).toBe(false) // repositioned outside
  expect(isEnclosed(0, 50, cw)).toBe(true) // boundary → inclusive (documented)
})

test('a panel missing a wall is NOT enclosing (6b cut hook)', () => {
  const cw = buildCollisionWorld(onePanelWorld(false))
  expect(cw.panels[0].fullyWalled).toBe(false)
  expect(isEnclosed(50, 50, cw)).toBe(false)
})

test('nearestSurface returns the closest edge point', () => {
  const cw = buildCollisionWorld(onePanelWorld(true))
  const n = nearestSurface(50, 8, cw) // 8px below the top edge
  expect(n?.dist).toBeCloseTo(8, 6)
  expect(n?.y).toBeCloseTo(0, 6)
})

// ── EVENTS + dedupe ───────────────────────────────────────────────────────────────
test('blocked emitted ONCE per contact (dedupe); re-emits after the contact lifts', () => {
  const tracker = createContactTracker()
  const wallContact: Contact = { entity: 'panel', segIndex: 3, nx: -1, ny: 0 }
  // 5 ticks pressed against the same wall → exactly one blocked.
  let blocked = 0
  for (let t = 0; t < 5; t++) blocked += tracker.update([wallContact]).filter((e) => e.type === 'blocked').length
  expect(blocked).toBe(1)
  // lift for a tick, then press again → a second blocked.
  tracker.update([])
  const again = tracker.update([wallContact]).filter((e) => e.type === 'blocked').length
  expect(again).toBe(1)
})

test('landing on a floor (upward normal) emits landed, not blocked', () => {
  const tracker = createContactTracker()
  const floor: Contact = { entity: 'panel', segIndex: 0, nx: 0, ny: -1 } // roof/top, normal up
  const evs = tracker.update([floor])
  expect(evs).toHaveLength(1)
  expect(evs[0].type).toBe('landed')
})
