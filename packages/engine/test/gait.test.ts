import { test, expect } from 'bun:test'
import { createGait, solveFk } from '../src/index'
import { STEP_MS } from '../src/loop'
import { loadRig, loadCharacter, loadPose } from './content'

const rig = loadRig()
const character = loadCharacter()
const stand = loadPose('stand', rig)

const FLOOR_Y = 60
const floorY = (): number => FLOOR_Y

// Map a planted footId to the ankle it pins: the foot bone's ORIGIN is the shin
// end, which the two-bone IK places exactly on the plant target.
function ankleOf(footId: string, angles: Record<string, number>, root: { x: number; y: number; rot: number }): { x: number; y: number } {
  const solved = solveFk(rig, { id: 'g', angles }, { proportions: character.proportions, rootTransform: root })
  const foot = solved.bones.find((b) => b.id === footId)!
  return { x: foot.ox, y: foot.oy }
}

// ── IK FOOT-LOCK GATE ─────────────────────────────────────────────────────────
test('foot-lock: a planted foot stays < 0.5px from its plant point (2 speeds)', () => {
  const results: Record<number, number> = {}
  for (const speed of [20, 45]) {
    const gait = createGait(rig, character, { floorY, speed, startX: 0, basePose: stand })
    let maxDev = 0
    // ~6 s of walking = several strides.
    const ticks = Math.round(6000 / STEP_MS)
    for (let i = 0; i < ticks; i++) {
      const { pose, planted } = gait.update(STEP_MS)
      for (const p of planted) {
        const fk = ankleOf(p.footId, pose.angles, pose.root)
        const dev = Math.hypot(fk.x - p.x, fk.y - p.y)
        if (dev > maxDev) maxDev = dev
      }
    }
    results[speed] = maxDev
    expect(maxDev).toBeLessThan(0.5)
  }
  console.log('[foot-lock] max ankle deviation px:', Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Number(v.toExponential(2))])))
})

// ── ROOT TRANSLATION GATE ─────────────────────────────────────────────────────
test('root translates the commanded distance within ±1%', () => {
  for (const speed of [20, 45]) {
    const seconds = 5
    const gait = createGait(rig, character, { floorY, speed, startX: 0, basePose: stand })
    const ticks = Math.round((seconds * 1000) / STEP_MS)
    let last = 0
    for (let i = 0; i < ticks; i++) last = gait.update(STEP_MS).pose.root.x
    const expected = speed * (ticks * STEP_MS) / 1000
    const err = Math.abs(last - expected) / expected
    console.log(`[translation] speed=${speed} expected=${expected.toFixed(3)} actual=${last.toFixed(3)} err=${(err * 100).toFixed(3)}%`)
    expect(err).toBeLessThan(0.01)
  }
})

// ── DETERMINISM ───────────────────────────────────────────────────────────────
test('gait output is identical across two runs (deterministic, no rng in hot path)', () => {
  function run(): number[] {
    const gait = createGait(rig, character, { floorY, speed: 30, startX: 0, basePose: stand })
    const out: number[] = []
    for (let i = 0; i < 5000; i++) {
      const { pose } = gait.update(STEP_MS)
      out.push(pose.root.x, pose.root.y, pose.angles.thighR, pose.angles.shinR, pose.angles.upperArmR)
    }
    return out
  }
  const a = run()
  const b = run()
  expect(a).toEqual(b)
})

// ── PLANTED-FOOT SANITY: exactly one or two feet planted, on the floor ─────────
test('planted feet sit on the floor and alternate (never both airborne mid-walk)', () => {
  const gait = createGait(rig, character, { floorY, speed: 35, startX: 0, basePose: stand })
  let sawSingleSupport = false
  for (let i = 0; i < Math.round(4000 / STEP_MS); i++) {
    const { planted } = gait.update(STEP_MS)
    for (const p of planted) expect(Math.abs(p.y - FLOOR_Y)).toBeLessThan(1e-6)
    expect(planted.length).toBeGreaterThanOrEqual(1) // duty 0.6 → always ≥1 planted
    if (planted.length === 1) sawSingleSupport = true
  }
  expect(sawSingleSupport).toBe(true)
})
