// Shared verlet/spring solver (L3) — ONE instance per world. Point particles with
// position-verlet integration, hard distance + moving-pin + soft spring-to-anchor
// constraints, fixed relaxation iterations, per-body sleeping, and a single energy
// inlet: applyImpulse. Character secondary (secondary.ts), props, and ropes all
// register their bodies in THIS one solver — there is never a second instance.
//
// DOM-free + deterministic (pure f64 arithmetic, no clock/random) and allocation-
// light: particles/constraints live in preallocated, doubling typed-array pools;
// step() runs entirely over indices with zero per-tick allocation. getState()/
// setState() convert the pools to/from plain JSON (numbers only) so the full state
// is snapshot/replay/hash-able (§3 rule 1).
//
// ── ENERGY POLICY (loud, on purpose) ─────────────────────────────────────────────
// The ONLY ways kinetic energy enters the sim are:
//   1. gravity            — the baseline world force, applied every tick to free particles;
//   2. applyImpulse(...)   — behavior `impulse` steps and user poke;
//   3. a MOVING PIN        — user drag (grab particle → setPin to the pointer, release →
//                            unpin). Drag is input, hence an allowed inlet.
// Nothing else may inject force. Controllers/blender/FK do NOT push particles; the
// character secondary only MOVES PIN/ANCHOR TARGETS (kinematic follow), which is the
// same class as a pin. If you find yourself adding a per-tick velocity from anywhere
// but these three, the design is wrong — fix the caller, not this file.
//
// ── VERLET INTEGRATION ───────────────────────────────────────────────────────────
//   vel   = (pos − prev) · damping           (per-body damping; energy dissipation)
//   pos'  = pos + vel + g·gravityScale·dt²    (dt = one sim tick = 1/120 s)
//   prev  = pos ; pos = pos'                  (prev = start-of-tick pos → velocity emerges)
// then `iterations` relaxation passes solve constraints (pinned particles = immovable).

import { STEP_MS } from './loop'

const DT = STEP_MS / 1000 // one sim tick in seconds (1/120)
const DT2 = DT * DT

// ── amended P5 constants (from the plan / Spike A) ───────────────────────────────
export const DEFAULT_GRAVITY = 1600 // px/s²  (Spike A: read right)
export const DEFAULT_DAMPING = 0.965 // per tick (Spike A: 0.985 settled too slowly; 0.96–0.97 snappier)
export const DEFAULT_ITERATIONS = 4 // Spike A: held 37 constraints without visible stretch

// Sleeping: a body whose max particle displacement stays under SLEEP_EPSILON for
// SLEEP_TICKS consecutive ticks is put to sleep (skipped entirely). Chosen so a prop
// that has visually stopped (<0.05px/tick ≈ 6px/s) sleeps after 0.5s of quiet.
export const SLEEP_EPSILON = 0.05 // px / tick
export const SLEEP_TICKS = 60 // consecutive quiet ticks (0.5 s @120Hz)

// Per-class anchor-spring stiffness for props (applied per relaxation iteration).
// Tuned so each class returns to <0.5px of rest within its settle bound (see
// verlet.settle.test); softer = looser wobble + longer settle. gravityScale 0 so a
// prop ALWAYS comes home to its authored rest (no permanent sag below it).
export const PROP_STIFFNESS: Record<StiffnessClass, number> = {
  soft: 0.01,
  medium: 0.035,
  stiff: 0.09,
}

export type StiffnessClass = 'soft' | 'medium' | 'stiff'
export type BodyKind = 'prop' | 'rope' | 'secondary' | 'free'

const C_DISTANCE = 0
const C_SPRING = 1

export interface VerletWorldOptions {
  gravity?: number
  damping?: number
  iterations?: number
  /** Master switch for sleeping (default true). The sleep-coverage negative control
   * flips this off to prove the stat measures sleeping, not something else. */
  sleeping?: boolean
}

export interface ParticleSpec {
  x: number
  y: number
  /** A pinned particle is not integrated; its position tracks its pin target. */
  pinned?: boolean
}

export type ConstraintSpec =
  | { kind: 'distance'; a: number; b: number; rest?: number; stiffness?: number; iters?: number }
  | { kind: 'spring'; a: number; ax: number; ay: number; stiffness?: number; iters?: number }

export interface BodyOptions {
  /** Per-body per-tick damping (default = world damping). Secondary uses 0.86 (Spike B). */
  damping?: number
  /** Gravity multiplier (default 1). Secondary & props use 0 — lag/spring driven, no sag. */
  gravityScale?: number
}

/** Handle returned by add*(): global particle + constraint ids for later reference. */
export interface BodyHandle {
  id: string
  kind: BodyKind
  particleIds: number[]
  constraintIds: number[]
}

export interface PropSpec {
  x: number
  y: number
  w: number
  h: number
  stiffnessClass: StiffnessClass
}

export interface RopeSpec {
  ax: number
  ay: number
  bx: number
  by: number
  particles: number
  /** Extra length as a fraction of the span (0 = taut, 0.2 = 20% slack → sag). */
  slack?: number
}

export interface Point {
  x: number
  y: number
}

/** Read/write view over the particle pool handed to a collision pass. Exposes
 * current position, start-of-tick position (prev, for swept checks), pinned/active
 * flags, and setters. Active = the particle's body is awake (not sleeping). */
export interface ParticleView {
  count: number
  active(i: number): boolean
  isPinned(i: number): boolean
  x(i: number): number
  y(i: number): number
  prevX(i: number): number
  prevY(i: number): number
  setPos(i: number, x: number, y: number): void
  setPrev(i: number, x: number, y: number): void
}

/** A post-relaxation projection pass (P6 collision hook). Runs inside step() AFTER
 * the constraint relaxation and BEFORE sleep evaluation, so a projected particle's
 * corrected displacement feeds the sleep check (a prop pushed onto a surface and
 * held there reads as quiet and sleeps). Default: none (no-op). */
export type CollisionPass = (view: ParticleView) => void

/** Fully serializable solver state (plain JSON — hashState-able, §3 rule 1). */
export interface VerletState {
  px: number[]
  py: number[]
  ox: number[]
  oy: number[]
  pinned: number[]
  pinX: number[]
  pinY: number[]
  cAx: number[]
  cAy: number[]
  quietTicks: number[]
  sleeping: number[]
}

export interface VerletWorld {
  step(): void
  addBody(id: string, particles: ParticleSpec[], constraints: ConstraintSpec[], kind: BodyKind, opts?: BodyOptions): BodyHandle
  addProp(id: string, spec: PropSpec): BodyHandle
  addRope(id: string, spec: RopeSpec): BodyHandle
  loadRope(id: string, x: number, weight: number): void
  ropePoints(id: string): Point[]
  /** Add velocity (px/s) to every particle of a body. The ONLY force inlet besides
   * gravity and pins. Wakes the body. */
  applyImpulse(bodyId: string, vx: number, vy: number): void
  /** Grab a particle and pin it to (x,y) — a moving pin (drag). Wakes its body. */
  setPin(particleId: number, x: number, y: number): void
  /** Update a pin's target without the flick/velocity semantics of a fresh grab
   * (kinematic follow — used by the character secondary anchors). Wakes its body. */
  setPinTarget(particleId: number, x: number, y: number): void
  /** Release a pinned particle; its carried velocity (last drag delta) flings it. */
  unpin(particleId: number): void
  /** Move a spring constraint's anchor (secondary target follow; prop rest move in P6). */
  setSpringAnchor(constraintId: number, x: number, y: number): void
  /** Install (or clear, with null) the post-relaxation collision projection pass. */
  setCollisionPass(fn: CollisionPass | null): void
  particle(id: number): Point
  /** Allocation-free reads of one particle coordinate (hot render paths). */
  particleX(id: number): number
  particleY(id: number): number
  /** The world's relaxation iteration count (fixed at creation; default 4). */
  readonly iterations: number
  bodyHandle(id: string): BodyHandle | undefined
  /** Awake bodies that moved this tick — the set the renderer draws. Reused array. */
  dirtyBodies(): readonly string[]
  /** Whether a specific body is currently asleep (skipped by the solver). */
  isAsleep(bodyId: string): boolean
  sleepStats(): { total: number; awake: number; asleep: number }
  getState(): VerletState
  setState(s: VerletState): void
}

interface BodyRec {
  id: string
  kind: BodyKind
  pStart: number
  pCount: number
  cStart: number
  cCount: number
  damping: number
  gravityScale: number
  quietTicks: number
  sleeping: boolean
  movedThisTick: boolean
  /** Body indices linked by a CROSS-BODY constraint (e.g. a rope load). Linked
   * bodies form a wake group: waking one wakes the others, and none may sleep
   * unless every neighbour is also quiet — otherwise an awake body's constraint
   * would write into a sleeping (skipped) body's particles, or a sleeping body's
   * constraint would silently stop coupling an awake one. */
  neighbors: number[]
}

function grow(a: Float64Array, need: number): Float64Array {
  if (need <= a.length) return a
  let cap = a.length || 8
  while (cap < need) cap *= 2
  const n = new Float64Array(cap)
  n.set(a)
  return n
}
function growI(a: Int32Array, need: number): Int32Array {
  if (need <= a.length) return a
  let cap = a.length || 8
  while (cap < need) cap *= 2
  const n = new Int32Array(cap)
  n.set(a)
  return n
}
function growU(a: Uint8Array, need: number): Uint8Array {
  if (need <= a.length) return a
  let cap = a.length || 8
  while (cap < need) cap *= 2
  const n = new Uint8Array(cap)
  n.set(a)
  return n
}

export function createVerletWorld(opts?: VerletWorldOptions): VerletWorld {
  const gravity = opts?.gravity ?? DEFAULT_GRAVITY
  const worldDamping = opts?.damping ?? DEFAULT_DAMPING
  const iterations = opts?.iterations ?? DEFAULT_ITERATIONS
  const sleepingEnabled = opts?.sleeping ?? true

  // ── particle pool (SoA) ───────────────────────────────────────────────────────
  let px: Float64Array = new Float64Array(0)
  let py: Float64Array = new Float64Array(0)
  let ox: Float64Array = new Float64Array(0)
  let oy: Float64Array = new Float64Array(0)
  let pinned: Uint8Array = new Uint8Array(0)
  let pinX: Float64Array = new Float64Array(0)
  let pinY: Float64Array = new Float64Array(0)
  let pBody: Int32Array = new Int32Array(0)
  let nP = 0

  // ── constraint pool (SoA) ───────────────────────────────────────────────────────
  let cKind: Uint8Array = new Uint8Array(0)
  let cA: Int32Array = new Int32Array(0)
  let cB: Int32Array = new Int32Array(0)
  let cRest: Float64Array = new Float64Array(0)
  let cAx: Float64Array = new Float64Array(0)
  let cAy: Float64Array = new Float64Array(0)
  let cStiff: Float64Array = new Float64Array(0)
  let cIters: Int32Array = new Int32Array(0)
  let cBody: Int32Array = new Int32Array(0)
  let nC = 0

  const bodies: BodyRec[] = []
  const byId = new Map<string, number>()
  // Rope bookkeeping for ropePoints()/loadRope(): chain particle ids (excl. any load).
  const ropeChain = new Map<string, number[]>()
  const ropeBuf = new Map<string, Point[]>()

  const dirty: string[] = [] // reused each tick (zero-alloc dirtyBodies)

  // ── collision projection pass (P6 hook) ────────────────────────────────────────
  let collisionPass: CollisionPass | null = null
  // A single reusable view object (zero per-tick allocation). `active` reports the
  // particle's body as awake — sleeping bodies are skipped by the solver, so their
  // particles are inert and the pass leaves them alone.
  const particleView: ParticleView = {
    get count(): number {
      return nP
    },
    active(i) {
      return !bodies[pBody[i]].sleeping
    },
    isPinned(i) {
      return pinned[i] === 1
    },
    x(i) {
      return px[i]
    },
    y(i) {
      return py[i]
    },
    prevX(i) {
      return ox[i]
    },
    prevY(i) {
      return oy[i]
    },
    setPos(i, x, y) {
      px[i] = x
      py[i] = y
    },
    setPrev(i, x, y) {
      ox[i] = x
      oy[i] = y
    },
  }

  function ensureParticles(add: number): void {
    const need = nP + add
    px = grow(px, need)
    py = grow(py, need)
    ox = grow(ox, need)
    oy = grow(oy, need)
    pinned = growU(pinned, need)
    pinX = grow(pinX, need)
    pinY = grow(pinY, need)
    pBody = growI(pBody, need)
  }
  function ensureConstraints(add: number): void {
    const need = nC + add
    cKind = growU(cKind, need)
    cA = growI(cA, need)
    cB = growI(cB, need)
    cRest = grow(cRest, need)
    cAx = grow(cAx, need)
    cAy = grow(cAy, need)
    cStiff = grow(cStiff, need)
    cIters = growI(cIters, need)
    cBody = growI(cBody, need)
  }

  function addBody(
    id: string,
    particles: ParticleSpec[],
    constraints: ConstraintSpec[],
    kind: BodyKind,
    o?: BodyOptions,
  ): BodyHandle {
    if (byId.has(id)) throw new Error(`verlet: duplicate body id ${JSON.stringify(id)}`)
    const bodyIndex = bodies.length
    const pStart = nP
    ensureParticles(particles.length)
    const particleIds: number[] = []
    for (const p of particles) {
      const i = nP++
      px[i] = p.x
      py[i] = p.y
      ox[i] = p.x
      oy[i] = p.y
      pinned[i] = p.pinned ? 1 : 0
      pinX[i] = p.x
      pinY[i] = p.y
      pBody[i] = bodyIndex
      particleIds.push(i)
    }
    const cStart = nC
    ensureConstraints(constraints.length)
    const constraintIds: number[] = []
    for (const c of constraints) {
      const i = nC++
      cBody[i] = bodyIndex
      if (c.kind === 'distance') {
        const a = pStart + c.a
        const b = pStart + c.b
        cKind[i] = C_DISTANCE
        cA[i] = a
        cB[i] = b
        cRest[i] = c.rest ?? Math.hypot(px[a] - px[b], py[a] - py[b])
        cStiff[i] = c.stiffness ?? 1
        cIters[i] = c.iters ?? iterations
      } else {
        cKind[i] = C_SPRING
        cA[i] = pStart + c.a
        cB[i] = -1
        cAx[i] = c.ax
        cAy[i] = c.ay
        cStiff[i] = c.stiffness ?? 0.05
        cIters[i] = c.iters ?? iterations
      }
      constraintIds.push(i)
    }
    bodies.push({
      id,
      kind,
      pStart,
      pCount: particles.length,
      cStart,
      cCount: constraints.length,
      damping: o?.damping ?? worldDamping,
      gravityScale: o?.gravityScale ?? 1,
      quietTicks: 0,
      sleeping: false,
      movedThisTick: false,
      neighbors: [],
    })
    byId.set(id, bodyIndex)
    return { id, kind, particleIds, constraintIds }
  }

  /** Append a distance constraint between two GLOBAL particle ids, owned by the
   * LAST-ADDED body (keeps its constraint range contiguous). If the particles live
   * in different bodies, links them as wake-group neighbours. Internal — the only
   * cross-body constraint path in P5 (rope loads); P6 collision will generalize it. */
  function addCrossConstraint(aGlobal: number, bGlobal: number, rest: number, stiffness: number): number {
    const owner = bodies.length - 1
    const b = bodies[owner]
    if (b.cStart + b.cCount !== nC) throw new Error('verlet: cross constraint must follow its owner body')
    ensureConstraints(1)
    const i = nC++
    cKind[i] = C_DISTANCE
    cA[i] = aGlobal
    cB[i] = bGlobal
    cRest[i] = rest
    cStiff[i] = stiffness
    cIters[i] = iterations
    cBody[i] = owner
    b.cCount++
    const otherBody = pBody[aGlobal] === owner ? pBody[bGlobal] : pBody[aGlobal]
    if (otherBody !== owner) {
      bodies[owner].neighbors.push(otherBody)
      bodies[otherBody].neighbors.push(owner)
    }
    return i
  }

  function addProp(id: string, spec: PropSpec): BodyHandle {
    // Two particles on the prop's horizontal axis → the pair gives centre + rotation.
    // Each is spring-anchored to its authored rest point (always comes home); a hard
    // distance keeps the bar rigid. gravityScale 0 so rest IS the home.
    const hw = spec.w / 2
    const lx = spec.x - hw
    const rx = spec.x + hw
    const stiff = PROP_STIFFNESS[spec.stiffnessClass]
    return addBody(
      id,
      [
        { x: lx, y: spec.y },
        { x: rx, y: spec.y },
      ],
      [
        { kind: 'distance', a: 0, b: 1, rest: spec.w, stiffness: 1 },
        { kind: 'spring', a: 0, ax: lx, ay: spec.y, stiffness: stiff },
        { kind: 'spring', a: 1, ax: rx, ay: spec.y, stiffness: stiff },
      ],
      'prop',
      { gravityScale: 0 },
    )
  }

  function addRope(id: string, spec: RopeSpec): BodyHandle {
    const n = Math.max(2, spec.particles)
    const span = Math.hypot(spec.bx - spec.ax, spec.by - spec.ay)
    const seg = (span * (1 + (spec.slack ?? 0))) / (n - 1)
    const parts: ParticleSpec[] = []
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      parts.push({ x: spec.ax + (spec.bx - spec.ax) * t, y: spec.ay + (spec.by - spec.ay) * t, pinned: i === 0 || i === n - 1 })
    }
    const cons: ConstraintSpec[] = []
    for (let i = 0; i < n - 1; i++) cons.push({ kind: 'distance', a: i, b: i + 1, rest: seg, stiffness: 1 })
    const h = addBody(id, parts, cons, 'rope')
    ropeChain.set(id, h.particleIds.slice())
    ropeBuf.set(id, h.particleIds.map(() => ({ x: 0, y: 0 })))
    return h
  }

  function loadRope(id: string, x: number, weight: number): void {
    const chain = ropeChain.get(id)
    if (!chain) throw new Error(`verlet: no rope ${JSON.stringify(id)}`)
    // Attach a heavy particle to the nearest chain node — its extra gravity sags the
    // rope (a stand-in for a load; a real standing character arrives in P7). Weight
    // scales gravityScale. A short hard distance couples it to the node.
    let best = chain[1] ?? chain[0]
    let bestDx = Infinity
    for (const pid of chain) {
      const d = Math.abs(px[pid] - x)
      if (d < bestDx) {
        bestDx = d
        best = pid
      }
    }
    const nx = px[best]
    const ny = py[best]
    const loadBody = addBody(`${id}__load`, [{ x: nx, y: ny + 6 }], [], 'free', {
      gravityScale: Math.max(1, weight),
    })
    // The coupling constraint references a particle in ANOTHER body (the rope node) —
    // the one cross-body constraint in P5. addCrossConstraint links load↔rope as a
    // wake group, so a poke on either wakes both and neither sleeps while the other
    // is active (a load at rest DOES reach sleep — equilibrium is quiet — which is
    // exactly why the group coupling is needed, not a "loads never sleep" assumption).
    addCrossConstraint(loadBody.particleIds[0], best, 6, 1)
  }

  function ropePoints(id: string): Point[] {
    const chain = ropeChain.get(id)
    const buf = ropeBuf.get(id)
    if (!chain || !buf) throw new Error(`verlet: no rope ${JSON.stringify(id)}`)
    for (let i = 0; i < chain.length; i++) {
      buf[i].x = px[chain[i]]
      buf[i].y = py[chain[i]]
    }
    return buf
  }

  function wake(bodyIndex: number): void {
    const b = bodies[bodyIndex]
    if (!b.sleeping && b.quietTicks === 0) return // already fully awake — stop propagation
    b.sleeping = false
    b.quietTicks = 0
    // Wake-group propagation: constraint neighbours wake with us (see BodyRec.neighbors).
    for (let i = 0; i < b.neighbors.length; i++) wake(b.neighbors[i])
  }

  function applyImpulse(bodyId: string, vx: number, vy: number): void {
    const bi = byId.get(bodyId)
    if (bi === undefined) return
    const b = bodies[bi]
    for (let i = b.pStart; i < b.pStart + b.pCount; i++) {
      if (pinned[i]) continue
      // Position verlet: velocity emerges as (pos − prev), so ADDING velocity means
      // moving prev BACKWARD along it. (+vx, +vy) pushes right/down (SVG y-down).
      ox[i] -= vx * DT
      oy[i] -= vy * DT
    }
    wake(bi)
  }

  function setPin(particleId: number, x: number, y: number): void {
    // Fresh grab: record the current pos as prev so a subsequent move imparts the
    // drag velocity (flick-on-release). Achieved by leaving ox/oy as-is and only
    // moving the pin target; the integrate step folds pos→prev then pos=target.
    pinned[particleId] = 1
    pinX[particleId] = x
    pinY[particleId] = y
    wake(pBody[particleId])
  }

  function setPinTarget(particleId: number, x: number, y: number): void {
    pinX[particleId] = x
    pinY[particleId] = y
    wake(pBody[particleId])
  }

  function unpin(particleId: number): void {
    pinned[particleId] = 0
    wake(pBody[particleId])
  }

  function setSpringAnchor(constraintId: number, x: number, y: number): void {
    cAx[constraintId] = x
    cAy[constraintId] = y
    wake(cBody[constraintId])
  }

  function setCollisionPass(fn: CollisionPass | null): void {
    collisionPass = fn
  }

  function integrateBody(b: BodyRec): void {
    const damp = b.damping
    const gy = gravity * b.gravityScale * DT2
    const end = b.pStart + b.pCount
    for (let i = b.pStart; i < end; i++) {
      if (pinned[i]) {
        // pos → prev (carries drag velocity), then snap to the pin target.
        ox[i] = px[i]
        oy[i] = py[i]
        px[i] = pinX[i]
        py[i] = pinY[i]
        continue
      }
      const vx = (px[i] - ox[i]) * damp
      const vy = (py[i] - oy[i]) * damp
      ox[i] = px[i]
      oy[i] = py[i]
      px[i] = px[i] + vx
      py[i] = py[i] + vy + gy
    }
  }

  function solveConstraint(i: number): void {
    if (cKind[i] === C_SPRING) {
      const a = cA[i]
      if (pinned[a]) return
      const k = cStiff[i]
      px[a] += (cAx[i] - px[a]) * k
      py[a] += (cAy[i] - py[a]) * k
      return
    }
    // distance
    const a = cA[i]
    const b = cB[i]
    const dx = px[b] - px[a]
    const dy = py[b] - py[a]
    const d = Math.hypot(dx, dy)
    if (d === 0) return
    const diff = ((d - cRest[i]) / d) * cStiff[i]
    const pa = pinned[a] ? 1 : 0
    const pb = pinned[b] ? 1 : 0
    if (pa && pb) return
    if (pa) {
      // only b moves
      px[b] -= dx * diff
      py[b] -= dy * diff
    } else if (pb) {
      px[a] += dx * diff
      py[a] += dy * diff
    } else {
      const hx = dx * diff * 0.5
      const hy = dy * diff * 0.5
      px[a] += hx
      py[a] += hy
      px[b] -= hx
      py[b] -= hy
    }
  }

  function step(): void {
    dirty.length = 0
    // 1. integrate (per awake body; sleeping bodies skipped entirely).
    for (let bi = 0; bi < bodies.length; bi++) {
      const b = bodies[bi]
      if (b.sleeping) continue
      integrateBody(b)
    }
    // 2. relaxation — constraints applied in registration order, per-constraint iters.
    for (let iter = 0; iter < iterations; iter++) {
      for (let bi = 0; bi < bodies.length; bi++) {
        const b = bodies[bi]
        if (b.sleeping) continue
        const end = b.cStart + b.cCount
        for (let i = b.cStart; i < end; i++) {
          if (iter < cIters[i]) solveConstraint(i)
        }
      }
    }
    // 2b. collision projection (P6) — project awake particles out of panel
    //     segments/interiors, BEFORE sleep eval so a rested prop reads as quiet.
    if (collisionPass) collisionPass(particleView)
    // 3. sleep evaluation + dirty set. Displacement = |final − start-of-tick|.
    for (let bi = 0; bi < bodies.length; bi++) {
      const b = bodies[bi]
      if (b.sleeping) {
        b.movedThisTick = false
        continue
      }
      let maxDisp = 0
      const end = b.pStart + b.pCount
      for (let i = b.pStart; i < end; i++) {
        if (pinned[i]) continue
        const d = Math.hypot(px[i] - ox[i], py[i] - oy[i])
        if (d > maxDisp) maxDisp = d
      }
      b.movedThisTick = maxDisp > 0
      if (sleepingEnabled) {
        if (maxDisp < SLEEP_EPSILON) {
          b.quietTicks++
          if (b.quietTicks >= SLEEP_TICKS) {
            // Wake-group rule: only sleep when every constraint neighbour is also
            // quiet — an awake neighbour's cross-body constraint must keep solving
            // against OUR particles (and vice versa), so the group sleeps together.
            let groupQuiet = true
            for (let k = 0; k < b.neighbors.length; k++) {
              const nb = bodies[b.neighbors[k]]
              if (!nb.sleeping && nb.quietTicks < SLEEP_TICKS) {
                groupQuiet = false
                break
              }
            }
            if (groupQuiet) b.sleeping = true
          }
        } else {
          b.quietTicks = 0
        }
      }
      if (!b.sleeping && b.movedThisTick) dirty.push(b.id)
    }
  }

  function dirtyBodies(): readonly string[] {
    return dirty
  }

  function isAsleep(bodyId: string): boolean {
    const bi = byId.get(bodyId)
    return bi === undefined ? false : bodies[bi].sleeping
  }

  function sleepStats(): { total: number; awake: number; asleep: number } {
    let asleep = 0
    for (const b of bodies) if (b.sleeping) asleep++
    return { total: bodies.length, awake: bodies.length - asleep, asleep }
  }

  function particle(id: number): Point {
    return { x: px[id], y: py[id] }
  }

  function particleX(id: number): number {
    return px[id]
  }
  function particleY(id: number): number {
    return py[id]
  }

  function bodyHandle(id: string): BodyHandle | undefined {
    const bi = byId.get(id)
    if (bi === undefined) return undefined
    const b = bodies[bi]
    const particleIds: number[] = []
    for (let i = b.pStart; i < b.pStart + b.pCount; i++) particleIds.push(i)
    const constraintIds: number[] = []
    for (let i = b.cStart; i < b.cStart + b.cCount; i++) constraintIds.push(i)
    return { id: b.id, kind: b.kind, particleIds, constraintIds }
  }

  function getState(): VerletState {
    return {
      px: Array.from(px.subarray(0, nP)),
      py: Array.from(py.subarray(0, nP)),
      ox: Array.from(ox.subarray(0, nP)),
      oy: Array.from(oy.subarray(0, nP)),
      pinned: Array.from(pinned.subarray(0, nP)),
      pinX: Array.from(pinX.subarray(0, nP)),
      pinY: Array.from(pinY.subarray(0, nP)),
      cAx: Array.from(cAx.subarray(0, nC)),
      cAy: Array.from(cAy.subarray(0, nC)),
      quietTicks: bodies.map((b) => b.quietTicks),
      sleeping: bodies.map((b) => (b.sleeping ? 1 : 0)),
    }
  }

  function setState(s: VerletState): void {
    for (let i = 0; i < nP; i++) {
      px[i] = s.px[i]
      py[i] = s.py[i]
      ox[i] = s.ox[i]
      oy[i] = s.oy[i]
      pinned[i] = s.pinned[i]
      pinX[i] = s.pinX[i]
      pinY[i] = s.pinY[i]
    }
    for (let i = 0; i < nC; i++) {
      cAx[i] = s.cAx[i]
      cAy[i] = s.cAy[i]
    }
    for (let bi = 0; bi < bodies.length; bi++) {
      bodies[bi].quietTicks = s.quietTicks[bi] ?? 0
      bodies[bi].sleeping = (s.sleeping[bi] ?? 0) === 1
    }
  }

  return {
    step,
    addBody,
    addProp,
    addRope,
    loadRope,
    ropePoints,
    applyImpulse,
    setPin,
    setPinTarget,
    unpin,
    setSpringAnchor,
    setCollisionPass,
    particle,
    particleX,
    particleY,
    bodyHandle,
    dirtyBodies,
    isAsleep,
    sleepStats,
    getState,
    setState,
    get iterations(): number {
      return iterations
    },
  }
}
