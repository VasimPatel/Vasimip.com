// Headless trace snapshot (Phase 3 gate): play the jump clip through a minimal
// sim wrapper — the deterministic engine clock + event bus — emit each marker on
// the bus stamped with the sim tick, and assert the resulting {tick,event} trace
// exactly matches a committed golden. This proves marker timing survives the
// tick-quantized loop and that the player→bus handoff is deterministic.
//
// Regenerate with:  REGEN_GOLDENS=1 bun test packages/headless/test/clip-markers.test.ts
import { test, expect } from 'bun:test'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createContext, createClipPlayer, STEP_MS } from '@dash/engine'
import { validateClipAgainstRig, tryValidateRig, type Clip, type RigTemplate } from '@dash/schema'

const CONTENT = new URL('../../../content/engine/', import.meta.url)
const readJson = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, CONTENT), 'utf8'))

function loadRig(): RigTemplate {
  const r = tryValidateRig(readJson('rig.dash.json'))
  if (!r.ok) throw new Error('bad rig')
  return r.doc
}
function loadClip(id: string, rig: RigTemplate): Clip {
  const r = validateClipAgainstRig(readJson(`clips/${id}.json`), rig)
  if (!r.ok) throw new Error(`bad clip ${id}: ${r.errors.join('; ')}`)
  return r.doc
}

const REGEN = process.env.REGEN_GOLDENS === '1'
const GOLDEN = new URL('./goldens/jump-markers.json', import.meta.url)

test('jump clip marker trace matches golden (tick-stamped, exact)', () => {
  const rig = loadRig()
  const jump = loadClip('jump', rig)

  // ── minimal sim wrapper: engine clock + traced bus, one clip player ──────────
  const ctx = createContext({ seed: 0 })
  const player = createClipPlayer(jump)
  const TOTAL_TICKS = Math.round(1000 / STEP_MS) + 4 // cover the 1000ms clip fully

  for (let i = 0; i < TOTAL_TICKS; i++) {
    ctx.clock.advance()
    const { markers } = player.advance(STEP_MS)
    for (const event of markers) ctx.events.emit('marker', { event })
  }

  const got = ctx.events
    .trace()
    .filter((e) => e.type === 'marker')
    .map((e) => ({ tick: e.tick, event: (e.payload as { event: string }).event }))

  if (REGEN) {
    writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + '\n')
    return
  }
  if (!existsSync(GOLDEN)) throw new Error('missing golden jump-markers.json — run REGEN_GOLDENS=1')
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'))
  expect(got).toEqual(golden)
  // sanity: exactly the two authored markers, in order
  expect(got.map((g) => g.event)).toEqual(['launch', 'land'])
})
