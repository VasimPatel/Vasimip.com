// P9 contextual travel refs: a builtin travel behavior (jumpTo travel:to#interior)
// resolves against the bound from/to panels; unbound → loud failure.
import { test, expect } from 'bun:test'
import type { WorldDocV2 } from '@dash/schema'
import { panelEdges } from '../src/index'
import { newRuntime, driveUntilDone, eventsOf } from './harness'
import builtinHop from '../../../content/engine/behaviors/builtin/hop.json'

const A = { x: 0, y: 200, w: 160, h: 100 }
const B = { x: 240, y: 200, w: 160, h: 100 }
function world(): WorldDocV2 {
  return {
    schemaVersion: 2,
    seed: 7,
    entities: [
      { id: 'panelA', components: { transform: { x: A.x, y: A.y }, surface: { box: A, anchor: { dx: 80, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(A) } } },
      { id: 'panelB', components: { transform: { x: B.x, y: B.y }, surface: { box: B, anchor: { dx: 80, dy: 0 } }, collidable: { shape: 'segments', segments: panelEdges(B) } } },
    ],
  }
}

test('travel:to resolves against the bound context; behavior arrives at panel B', () => {
  const r = newRuntime(world(), { x: 80, y: 200 - 40 })
  const cap = r.rt.capsule()
  r.rt.transform.y += 200 - (cap.y1 + cap.r)
  r.rt.runBehavior(builtinHop as never, { travel: { from: 'panelA', to: 'panelB' } })
  driveUntilDone(r, 4000)
  expect(eventsOf(r, 'intent:arrived').length).toBeGreaterThan(0)
  // Arrived at panel B's interior spot x (anchor dx 80 → 320).
  expect(Math.abs(r.rt.transform.x - 320)).toBeLessThan(30)
})

test('unbound travel context fails loudly (unresolvable target)', () => {
  const r = newRuntime(world(), { x: 80, y: 200 - 40 })
  const cap = r.rt.capsule()
  r.rt.transform.y += 200 - (cap.y1 + cap.r)
  r.rt.runBehavior(builtinHop as never)
  driveUntilDone(r, 1000)
  expect(eventsOf(r, 'intent:failed').length).toBeGreaterThan(0)
  expect(eventsOf(r, 'intent:arrived').length).toBe(0)
})

test('travel context survives snapshot/restore', () => {
  const r = newRuntime(world(), { x: 80, y: 160 })
  r.rt.runBehavior(builtinHop as never, { travel: { from: 'panelA', to: 'panelB' } })
  const s = r.rt.getState()
  expect(s.locomotion.travelCtx).toEqual({ from: 'panelA', to: 'panelB' })
})
