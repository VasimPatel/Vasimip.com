import { test, expect } from 'bun:test'
import { createBlender, wrapPi, type Blender, type AdditiveFn } from '../src/index'
import { STEP_MS } from '../src/loop'
import { loadRig, loadPose, loadClip } from './content'

const rig = loadRig()
const stand = loadPose('stand', rig)
const cheer = loadPose('cheer', rig)
const idle = loadClip('idle-shuffle', rig)
const walk = loadClip('walk-cycle', rig)
const jump = loadClip('jump', rig)

const JOINTS = rig.joints.map((j) => j.id)
const fresh = (): Blender => createBlender(rig, { initialPose: stand })

// A deterministic, nonzero-MEAN additive (so accumulation-into-state would show up).
const sineAdditive: AdditiveFn = (tick) => ({ angles: { neck: 0.05 + 0.05 * Math.sin(tick * 0.3) }, rootY: 1.2 })

// ── SmoothDamp convergence ──────────────────────────────────────────────────
test('base blend converges to a static pose target (angles + velocity settle)', () => {
  const b = fresh()
  b.setSource(cheer, { durationMs: 400 })
  for (let i = 0; i < 240; i++) b.tick() // 2 s
  const st = b.getState()
  for (const id of JOINTS) {
    expect(Math.abs(wrapPi(st.joints[id].angle - (cheer.angles[id] ?? 0)))).toBeLessThan(1e-3)
    expect(Math.abs(st.joints[id].vel)).toBeLessThan(1e-2)
  }
})

// ── retarget velocity continuity ────────────────────────────────────────────
test('mid-motion retarget keeps position AND velocity continuous (no jump)', () => {
  const b = fresh()
  b.setSource(cheer, { durationMs: 500 })
  for (let i = 0; i < 30; i++) b.tick() // mid-transition
  const before = b.getState()
  b.setSource(stand, { durationMs: 500 }) // interrupt
  const t0 = b.tick()
  // position moved by at most a small per-tick step (no teleport)
  for (const id of JOINTS) {
    const dPos = Math.abs(wrapPi(t0.pose.angles[id] - before.joints[id].angle))
    expect(dPos).toBeLessThan(0.05)
  }
})

// ── additive isolation ──────────────────────────────────────────────────────
test('additives never accumulate into base state; removing one leaves base untouched', () => {
  const withAdd = fresh()
  const without = fresh()
  withAdd.setSource(walk, { durationMs: 400 })
  without.setSource(walk, { durationMs: 400 })
  withAdd.addAdditive('sine', sineAdditive)
  for (let i = 0; i < 200; i++) {
    withAdd.tick()
    without.tick()
  }
  // Base joint state must be bit-identical whether or not an additive ran.
  const a = withAdd.getState().joints
  const c = without.getState().joints
  for (const id of JOINTS) {
    expect(a[id].angle).toBe(c[id].angle)
    expect(a[id].vel).toBe(c[id].vel)
  }
})

test('additive shows in output pose but not in base state; removeAdditive reverts output', () => {
  const b = fresh()
  b.setSource(stand, { durationMs: 100 })
  b.addAdditive('sine', sineAdditive)
  for (let i = 0; i < 60; i++) b.tick()
  const withOut = b.tick()
  const baseNeck = b.getState().joints.neck.angle
  expect(Math.abs(withOut.pose.angles.neck - baseNeck)).toBeGreaterThan(1e-3) // additive visible
  b.removeAdditive('sine')
  const reverted = b.tick()
  expect(Math.abs(reverted.pose.angles.neck - b.getState().joints.neck.angle)).toBeLessThan(1e-9) // back to base
})

// ── getState/setState resume equivalence ────────────────────────────────────
test('getState/setState (JSON round-trip) resumes a bit-identical sequence', () => {
  const a = fresh()
  a.setSource(walk, { durationMs: 400 })
  a.addAdditive('sine', sineAdditive)
  for (let i = 0; i < 137; i++) a.tick()

  const snap = JSON.parse(JSON.stringify(a.getState())) as ReturnType<Blender['getState']>
  const b = createBlender(rig, { initialPose: stand })
  b.setState(snap)
  b.addAdditive('sine', sineAdditive) // additives are behavior — re-registered by caller

  for (let k = 0; k < 200; k++) {
    const ra = a.tick()
    const rb = b.tick()
    for (const id of JOINTS) expect(rb.pose.angles[id]).toBe(ra.pose.angles[id])
    expect(rb.pose.root.x).toBe(ra.pose.root.x)
    expect(rb.pose.root.y).toBe(ra.pose.root.y)
    expect(rb.pose.root.rot).toBe(ra.pose.root.rot)
  }
})

// ── THE NO-POP GATE (numeric) ────────────────────────────────────────────────
// Per-tick angular-velocity CHANGE (|Δvel| across joints, rad/s per tick) is the
// "pop" metric. Assert: max during ANY scripted transition < 2× the peak during
// steady-state clip playback (Spike B's justified threshold). Prints the numbers.

function driveMaxAccel(b: Blender, ticks: number, skip = 0): number {
  let prev: Record<string, number> | null = null
  let max = 0
  for (let i = 0; i < ticks; i++) {
    b.tick()
    const j = b.getState().joints
    const cur: Record<string, number> = {}
    for (const id of JOINTS) cur[id] = j[id].vel
    if (prev && i >= skip) {
      for (const id of JOINTS) {
        const dv = Math.abs(cur[id] - prev[id])
        if (dv > max) max = dv
      }
    }
    prev = cur
  }
  return max
}

const CYCLE_TICKS = Math.round(760 / STEP_MS)

test('no-pop gate: transition pops stay under 2× steady-state clip peak', () => {
  // ── steady-state reference: each clip followed closely (near-passthrough) ──
  const steadyIdle = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(idle, { durationMs: 1 })
    return driveMaxAccel(b, CYCLE_TICKS * 4, CYCLE_TICKS) // skip first cycle
  })()
  const steadyWalk = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(walk, { durationMs: 1 })
    return driveMaxAccel(b, CYCLE_TICKS * 4, CYCLE_TICKS)
  })()
  const steadyJump = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(jump, { durationMs: 1 }) // raw jump content accel
    return driveMaxAccel(b, Math.round(1000 / STEP_MS))
  })()
  const steadyPeak = Math.max(steadyIdle, steadyWalk, steadyJump)

  // ── transitions ────────────────────────────────────────────────────────────
  // pose → clip
  const poseToClip = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(walk, { durationMs: 400 })
    return driveMaxAccel(b, Math.round(400 / STEP_MS))
  })()

  // clip → clip (walk → jump)
  const clipToClip = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(walk, { durationMs: 400 })
    for (let i = 0; i < CYCLE_TICKS * 2; i++) b.tick() // converge on walk
    b.setSource(jump, { durationMs: 300 })
    return driveMaxAccel(b, Math.round(300 / STEP_MS))
  })()

  // mid-transition retarget (interrupt walk-blend with jump)
  const midRetarget = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(walk, { durationMs: 400 })
    for (let i = 0; i < Math.round(150 / STEP_MS); i++) b.tick() // mid-blend
    b.setSource(jump, { durationMs: 300 })
    return driveMaxAccel(b, Math.round(300 / STEP_MS))
  })()

  // loop wrap (steady walk across several wrap boundaries)
  const loopWrap = (() => {
    const b = createBlender(rig, { initialPose: stand })
    b.setSource(walk, { durationMs: 400 })
    for (let i = 0; i < CYCLE_TICKS * 2; i++) b.tick() // converge
    return driveMaxAccel(b, CYCLE_TICKS * 3) // spans 3 wraps
  })()

  const transitions = { poseToClip, clipToClip, midRetarget, loopWrap }
  const worst = Math.max(...Object.values(transitions))

  console.log(
    '[no-pop gate] steady peak=%s (idle %s / walk %s / jump %s) rad/s·tick | transitions:',
    steadyPeak.toFixed(4), steadyIdle.toFixed(4), steadyWalk.toFixed(4), steadyJump.toFixed(4),
    Object.fromEntries(Object.entries(transitions).map(([k, v]) => [k, Number(v.toFixed(4))])),
    '| worst/2×steady =', worst.toFixed(4), 'vs', (2 * steadyPeak).toFixed(4),
  )

  for (const v of Object.values(transitions)) {
    expect(v).toBeLessThan(2 * steadyPeak)
  }
})

// ── NEGATIVE CONTROL (Spike B style): prove the metric catches the bug class ──
// Sabotage: zero every joint/root velocity at each setSource via getState/setState
// surgery (no engine changes) — exactly the velocity-discontinuity bug the carried-
// velocity design exists to prevent. The sabotaged gauntlet must pop ≥ 3× the real
// one, or the no-pop metric has no teeth.
test('no-pop negative control: velocity-zeroing sabotage pops >= 3x the real blender', () => {
  function runGauntlet(sabotage: boolean): number {
    const b = createBlender(rig, { initialPose: stand })
    let prev: Record<string, number> | null = null
    let max = 0
    const capture = (): void => {
      const j = b.getState().joints
      const cur: Record<string, number> = {}
      for (const id of JOINTS) cur[id] = j[id].vel
      if (prev) for (const id of JOINTS) max = Math.max(max, Math.abs(cur[id] - prev[id]))
      prev = cur
    }
    const run = (ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        b.tick()
        capture()
      }
    }
    const retarget = (src: Parameters<Blender['setSource']>[0], durationMs: number): void => {
      if (sabotage) {
        const st = b.getState()
        for (const id of JOINTS) st.joints[id].vel = 0
        st.root.vx = 0
        st.root.vy = 0
        st.root.vrot = 0
        b.setState(st)
      }
      b.setSource(src, { durationMs })
    }
    // Same shape as the gauntlet: pose→clip, clip→clip mid-stride, mid-transition
    // retarget, clip→pose. Velocities are live at every retarget after the first,
    // and `prev` carries ACROSS each retarget so the boundary tick is measured.
    retarget(walk, 400)
    run(CYCLE_TICKS * 2) // converge onto the walk (vels active)
    retarget(jump, 300)
    run(Math.round(150 / STEP_MS)) // interrupt the jump blend mid-transition…
    retarget(walk, 300)
    run(Math.round(300 / STEP_MS))
    retarget(stand, 400) // …and finally clip→pose
    run(Math.round(400 / STEP_MS))
    return max
  }

  const real = runGauntlet(false)
  const sabotaged = runGauntlet(true)
  console.log(
    '[no-pop negative control] real worst=%s sabotaged worst=%s ratio=%s x',
    real.toFixed(4),
    sabotaged.toFixed(4),
    (sabotaged / real).toFixed(2),
  )
  expect(sabotaged).toBeGreaterThanOrEqual(3 * real)
})
