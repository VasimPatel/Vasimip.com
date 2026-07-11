import { test, expect } from 'bun:test'
import {
  createBlender,
  createControllerSet,
  createRng,
  solveFk,
  lookAt,
  type Blender,
  type FaceAux,
} from '../src/index'
import { STEP_MS } from '../src/loop'
import { loadRig, loadCharacter, loadPose } from './content'

const rig = loadRig()
const character = loadCharacter()
const stand = loadPose('stand', rig)
const JOINTS = rig.joints.map((j) => j.id)

const WINDOW_TICKS = Math.round(2000 / STEP_MS) // 2 s
const TOTAL_TICKS = WINDOW_TICKS * 6 // 12 s idle (> 10 s)
const VAR_EPS = 1e-6

interface Sample {
  angles: Record<string, number>
  face: FaceAux
  headCx: number
}

/** Drive a blender + optional controller set for n ticks, returning the sampled
 * post-additive pose angles, aux face, and head centre each tick. */
function driveIdle(withControllers: boolean, target?: () => { x: number; y: number } | null, seed = 7): Sample[] {
  const blender: Blender = createBlender(rig, { initialPose: stand })
  const set = withControllers
    ? createControllerSet(blender, rig, character, { rng: createRng(seed), getTarget: target })
    : null
  const out: Sample[] = []
  for (let i = 0; i < TOTAL_TICKS; i++) {
    const face = set ? set.update(i) : { pupilDx: 0, pupilDy: 0, blink: 0 }
    const { pose } = blender.tick()
    const solved = solveFk(rig, { id: 'idle', angles: pose.angles }, { proportions: character.proportions, rootTransform: pose.root })
    if (set) set.feedSolved(solved)
    const head = solved.bones.find((b) => b.id === 'head')!
    out.push({ angles: { ...pose.angles }, face, headCx: head.ex })
  }
  return out
}

function variance(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length
}

/** Count joints whose angle variance exceeds VAR_EPS within a tick window. */
function movingJointCount(samples: Sample[]): number {
  let n = 0
  for (const id of JOINTS) {
    if (variance(samples.map((s) => s.angles[id])) > VAR_EPS) n++
  }
  return n
}

/** Max over joints of the per-tick angle-delta sign-flip rate (the anti-vibration
 * metric: a smooth breathing sine flips rarely; buzzing flips almost every tick). */
function maxSignFlipRate(samples: Sample[]): number {
  let worst = 0
  for (const id of JOINTS) {
    const a = samples.map((s) => s.angles[id])
    let flips = 0
    let prevSign = 0
    for (let i = 1; i < a.length; i++) {
      const d = a[i] - a[i - 1]
      const s = d > 0 ? 1 : d < 0 ? -1 : 0
      if (s !== 0) {
        if (prevSign !== 0 && s !== prevSign) flips++
        prevSign = s
      }
    }
    const rate = flips / (a.length - 1)
    if (rate > worst) worst = rate
  }
  return worst
}

// ── THE NEVER-STILL GATE ──────────────────────────────────────────────────────
test('never-still: ≥6 joints vary in EVERY 2s window over 12s idle; motion is breathing not buzzing', () => {
  const samples = driveIdle(true)
  const perWindow: number[] = []
  for (let w = 0; w * WINDOW_TICKS < samples.length; w++) {
    const win = samples.slice(w * WINDOW_TICKS, (w + 1) * WINDOW_TICKS)
    if (win.length < WINDOW_TICKS) break
    perWindow.push(movingJointCount(win))
  }
  const flipRate = maxSignFlipRate(samples)
  console.log('[never-still] moving joints per 2s window:', perWindow, '| max sign-flip rate:', flipRate.toFixed(4))
  for (const c of perWindow) expect(c).toBeGreaterThanOrEqual(6)
  expect(flipRate).toBeLessThan(0.1) // breathing, not vibrating
})

// ── NEGATIVE CONTROL: without controllers the SAME metric collapses ───────────
test('never-still negative control: a controller-less blender fails the ≥6-joints bar', () => {
  const samples = driveIdle(false)
  let maxMoving = 0
  for (let w = 0; w * WINDOW_TICKS < samples.length; w++) {
    const win = samples.slice(w * WINDOW_TICKS, (w + 1) * WINDOW_TICKS)
    if (win.length < WINDOW_TICKS) break
    maxMoving = Math.max(maxMoving, movingJointCount(win))
  }
  console.log('[never-still negative control] max moving joints in any window (no controllers):', maxMoving)
  expect(maxMoving).toBeLessThan(6) // the metric measures the controllers, not noise
})

// ── LOOK-AT TRACE ─────────────────────────────────────────────────────────────
test('look-at: pupils track a scripted moving target; head delta respects the clamp', () => {
  let targetX = 0
  const target = (): { x: number; y: number } => ({ x: targetX, y: 0 })
  const blender = createBlender(rig, { initialPose: stand })
  const set = createControllerSet(blender, rig, character, { rng: createRng(7), getTarget: target })

  let matches = 0
  let counted = 0
  let maxPupil = 0
  const blinkStarts: number[] = []
  let prevBlink = 0

  for (let i = 0; i < 1200; i++) {
    targetX = 220 * Math.sin((2 * Math.PI * 0.2 * i * STEP_MS) / 1000) // sinusoidal sweep
    const face = set.update(i)
    const { pose } = blender.tick()
    const solved = solveFk(rig, { id: 'look', angles: pose.angles }, { proportions: character.proportions, rootTransform: pose.root })
    set.feedSolved(solved)
    const head = solved.bones.find((b) => b.id === 'head')!

    if (i > 5 && Math.abs(targetX - head.ex) > 5) {
      counted++
      if (Math.sign(face.pupilDx) === Math.sign(targetX - head.ex)) matches++
    }
    maxPupil = Math.max(maxPupil, Math.abs(face.pupilDx), Math.abs(face.pupilDy))
    if (prevBlink === 0 && face.blink > 0) blinkStarts.push(i)
    prevBlink = face.blink
  }

  const ratio = matches / counted
  console.log(`[look-at] pupil-direction match ${(ratio * 100).toFixed(1)}% (${matches}/${counted}) | max pupil offset ${maxPupil.toFixed(3)} | blink starts ${JSON.stringify(blinkStarts)}`)
  expect(ratio).toBeGreaterThan(0.95) // pupils follow the target, with bounded lag
  expect(maxPupil).toBeLessThanOrEqual(3.0001) // clamped to pupilRange
  // deterministic blink pattern for seed 7 (matches the standalone probe)
  expect(blinkStarts.slice(0, 2)).toEqual([247, 532])
})

test('look-at head delta is clamped to ±0.35 even for an extreme target', () => {
  const ctrl = lookAt(() => ({ x: 10000, y: 10000 }), () => ({ cx: 0, cy: 0, worldAngle: -Math.PI / 2 }))
  const d = ctrl.fn(0).angles!.head
  expect(Math.abs(d)).toBeLessThanOrEqual(0.35 + 1e-9)
})

// ── DETERMINISM (5000 ticks, full set, same seed) ─────────────────────────────
function fnv(nums: number[]): string {
  const buf = new Float64Array(nums)
  const bytes = new Uint8Array(buf.buffer)
  let h = 0x811c9dc5
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

test('full controller set is bit-identical across two runs for a fixed seed (5000 ticks)', () => {
  function run(): number[] {
    let targetX = 0
    const blender = createBlender(rig, { initialPose: stand })
    const set = createControllerSet(blender, rig, character, { rng: createRng(999), getTarget: () => ({ x: targetX, y: 30 }) })
    const stream: number[] = []
    for (let i = 0; i < 5000; i++) {
      targetX = 150 * Math.sin(i * 0.01)
      const face = set.update(i)
      const { pose } = blender.tick()
      const solved = solveFk(rig, { id: 'd', angles: pose.angles }, { proportions: character.proportions, rootTransform: pose.root })
      set.feedSolved(solved)
      for (const id of JOINTS) stream.push(pose.angles[id])
      stream.push(pose.root.y, face.pupilDx, face.pupilDy, face.blink)
    }
    return stream
  }
  const a = run()
  const b = run()
  expect(a).toEqual(b)
  console.log('[determinism] 5000-tick full-set stream hash:', fnv(a))
})
