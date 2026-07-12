# Dash Engine v2 — Headless API (`@dash/headless`)

**Purpose of this document:** the precise reference for the stable, browser-free
surface of Dash Engine v2 — the three functions a future MCP tool wraps **1:1**
(ENGINE_V2 Phase 8). Everything here is **JSON-in / JSON-out** and
**deterministic by construction**. Written to be handed to the tool author (human or
model) with no further engine spelunking required.

The surface is exactly three functions, exported from `@dash/headless` (`packages/headless/src/index.ts`):

| function | one line |
|---|---|
| `validate(doc)` | shape-dispatched schema validation → `{ ok, kind, errors? }` |
| `simulate(input, opts?)` | build the full runtime stack, run one behavior to a terminal event → `{ trace, finalState, hash, ticks, outcome }` |
| `replay(input, expected, opts?)` | re-simulate and compare against a recorded result → `{ ok, hash, ticks, outcome, divergence? }` |

Depends only on `@dash/engine` + `@dash/schema`. DOM-free: runs in plain Node/Bun
(ENGINE_V2 §3 rule 2). It never reads the filesystem, a wall clock, or `Math.random`.

> **Demoted — not part of this surface.** The Phase 1 `createSim` placeholder (the
> random-walk determinism scaffold) is still exported from `index.ts` **only** to keep
> the P1 replay/snapshot gates running. It is deliberately absent from this document.
> New callers — and the MCP tool — use `simulate()` / `replay()` below. `createSim`
> is removed once those gates fold into the `simulate()`-based acceptance suite.

---

## 1. Determinism & hash identity (ENGINE_V2 §3 rule 1)

Determinism is guaranteed **by construction**, not by convention:

- The **entire input is `structuredClone`'d once, up front**. After the clone, no
  field of the caller's object is ever read again — so even a hostile `shouldAbort`
  callback mutating the input mid-run cannot touch the sim.
- The **seeded RNG is the only entropy source**. It is folded into `finalState.rng`
  and therefore into the hash; a run is resumable bit-for-bit from `finalState`.
- Nothing in the engine reads a wall clock. The *only* place wall-clock time is legal
  is the caller-supplied `shouldAbort` closure (see `SimulateOptions`), which lives in
  the route/tool layer — the engine never sees it.
- **Every nested doc is schema-validated** before construction — the world, each
  character/rig, each behavior doc, and each pose/clip (against its spec's rig).
  Nothing unvalidated reaches the engine; a bad doc throws a located error
  (`simulate: invalid characters[0].rig: …`).
- Registries (behaviors, poses, clips) are built on a **null prototype**: an id of
  `'__proto__'` is an inert, ordinary key — never prototype pollution.

**Hash scope (rule 1, verbatim):** replay/hash identity is guaranteed **within one
runtime** — Bun (headless, server, CI). The state hash consumes float **bit patterns**
(`Float64Array` → bytes), never decimal string formatting. Browsers run a different JS
engine (V8 vs JSC) whose transcendental functions (`sin`/`cos`/`exp`) are
implementation-defined; **never assert cross-runtime hash equality.** `simulate()`'s
hash is a Bun-scoped identity: the server (also Bun) reproduces it byte-for-byte, a
browser need not.

---

## 2. `simulate(input, opts?)`

Builds the FULL runtime stack — mutable world + one shared verlet solver + per-character
runtimes (each owning its own watchdog) — kicks off the single driven behavior, and
advances a fixed-timestep loop until that behavior reaches a **terminal event**
(`running()` goes false) or the tick cap is hit.

```ts
function simulate(input: SimulateInput, opts?: SimulateOptions): SimulateResult
```

### Input

```ts
interface SimulateInput {
  world: WorldDocV2                       // validated on entry; throws if invalid
  characters?: CharacterSpec[]            // characters to instantiate (all as data)
  behaviors?: BehaviorDoc[]               // behavior registry (id → doc)
  run?: { characterId: string; behaviorId: string }  // the ONE behavior to drive
  seed?: number                           // overrides world.seed for the RNG
  maxTicks?: number                       // tick cap (default 12000, hard cap 60000)
}

interface CharacterSpec {
  character: CharacterDoc                  // rig ref + personality + locomotion caps
  rig: RigTemplate                         // joint tree the character instantiates
  poses?: Record<string, Pose>             // named poses the solver/cues look up
  clips?: Record<string, Clip>             // named clips the solver/cues look up
  names?: CharacterNames                   // conventional clip/pose names (see below)
  restPose?: Pose                          // the pose the character rests in
  initialTransform?: CharacterTransform    // { x, y, rot, facing }
  initialFeetY?: number                    // snap the capsule bottom onto this world Y
  secondaryId?: string                     // verlet secondary chain id
  giveUp?: { shrug?: string; sit?: string }// default give-up reaction pose refs
  watchdog?: { maxBehaviorMs?: number }    // watchdog override; the runtime OWNS + TICKS it
}

interface CharacterNames {                 // clip/pose names the locomotion solver resolves
  idle?: string; walk?: string; jump?: string
  jumpLand?: string; tuck?: string; fly?: string
}
```

Every field is plain JSON. `simulate` clones the whole input in (§1), so the same
`CharacterSpec` object can be reused across calls with no cross-run leakage.
`initialFeetY` is applied **post-build** (so the capsule can be measured from the rig)
— it is the headless equivalent of the test harness's `snapFeet`.

The `run` target's character drives the mutable world's traversal graph (all runtimes
share one mutable world); per-character traversal is still available internally via
`traversal(capsOverride)`.

### Complexity caps (enforced up front, before cloning)

Over-cap input throws `simulate: complexity cap exceeded — …` **before** any cloning
or construction — so a pathological payload is rejected in microseconds, and the caps
bound the quadratic setup work (traversal build, collision segment sets) that a
wall-clock guard alone could not pre-empt. Exported as constants:

| constant | value | bounds |
|---|---:|---|
| `MAX_ENTITIES` | 200 | world entities |
| `MAX_SEGMENTS_PER_ENTITY` | 64 | collidable segments per entity |
| `MAX_CHARACTERS` | 8 | character specs per sim |
| `MAX_BEHAVIORS` | 64 | behavior docs in the registry |
| `MAX_BEHAVIOR_STEPS` | 64 | steps per behavior, per reaction list, cues per behavior |
| `MAX_LIBRARY_DOCS` | 64 | named poses / clips per character spec (each) |

### Options

```ts
interface SimulateOptions {
  // Route-layer wall-clock guard, checked during SETUP (between construction stages)
  // and BETWEEN ticks. Returning true aborts (outcome 'aborted', partial trace;
  // ticks = 0 if setup never finished). The engine itself never reads a clock.
  shouldAbort?: (progress: { tick: number; events: number }) => boolean
}
```

### Result

```ts
interface SimulateResult {
  trace: TraceEvent[]      // the full event trace (see §5 vocabulary)
  finalState: FinalState   // total serializable snapshot — resumes a bit-identical sim
  hash: string             // bit-exact hash of finalState (Bun-scoped, §1)
  ticks: number            // ticks actually simulated
  outcome: Outcome         // coarse terminal classification (see §4)
}

interface FinalState {
  tick: number                                    // sim tick reached
  rng: number                                     // RNG state (the only entropy) — resumable
  world: MutableWorldState                        // holes + heal timers
  verlet: VerletState                             // the one shared verlet world
  characters: { id: string; state: CharacterState }[]  // per-runtime state (incl. watchdog window)
}

type Outcome = 'complete' | 'ended' | 'halted' | 'watchdog' | 'maxticks' | 'aborted' | 'idle'
```

`finalState` is the **total** snapshot — enough to resume a bit-identical sim (§3 rule
1). `TraceEvent`, `FinalState`, `MutableWorldState`, `VerletState`, and `CharacterState`
are all plain-JSON serializable.

**Throws** (not a divergence — a caller error) when: a complexity cap is exceeded
(§2 caps); the world or ANY nested doc fails schema validation; `run.characterId` has
no matching character spec; or `run.behaviorId` is not in `behaviors[]`.

---

## 3. `validate(doc)`

The single stable validation entry point. Dispatches by the doc's **shape**
(discriminant top-level keys) to the right `@dash/schema` validator, returning a uniform
result that maps 1:1 onto an MCP tool result — no narrowed doc, JSON-pure.

```ts
function validate(doc: unknown): ValidateDispatch

type DocKind = 'world' | 'behavior' | 'rig' | 'clip' | 'ruleTable' | 'pose' | 'character' | 'unknown'
interface ValidateDispatch { ok: boolean; kind: DocKind; errors?: string[] }
```

### Dispatch table (a doc must match **exactly one** discriminant)

| top-level key present | `kind` | schema validator |
|---|---|---|
| `entities: []` | `world` | `tryValidateWorldV2` |
| `steps: []` | `behavior` | `tryValidateBehavior` |
| `joints: []` | `rig` | `tryValidateRig` |
| `tracks: []` | `clip` | `tryValidateClip` |
| `rows: []` | `ruleTable` | `tryValidateRuleTable` |
| `angles: {}` | `pose` | `tryValidatePose` |
| `personality: {}` **or** (`rig: string` **and** `locomotion: {}`) | `character` | `tryValidateCharacter` |
| _0 matches_ | `unknown` | → `{ ok: false }` with a "recognized shapes" error |
| _2+ matches_ | `unknown` | → `{ ok: false }` — **ambiguous**, never first-match: a doc carrying `entities[]` **and** `steps[]` is an error, not a world |

Belt-and-braces with the ambiguity rule, each validator also **closes its top-level
keys** — e.g. a world doc is exactly `{schemaVersion, seed, entities}`; any stray key
(`doc.sneaky: unknown field (closed schema)`) fails validation.

Pose/clip here run their **standalone** (structure-only) validators. Validating a pose
or clip against a *specific rig* needs the rig in hand and is out of this dispatcher's
scope (a later phase's concern, once rig + content travel together). Note `simulate()`
DOES validate poses/clips against their spec's rig (§1).

---

## 4. `replay(input, expected, opts?)` & the outcome↔terminal-event mapping

### The mapping

`outcome` is a coarse classification **derived from the trace** (the terminal event is
authoritative; `outcome` is a convenience discriminant):

| `outcome` | how it is reached | terminal trace event |
|---|---|---|
| `complete` | the behavior ran clean to the end (no reason) | `behavior:complete` |
| `ended` | a graceful end **with a reason** (e.g. an `onBlocked` reaction ran) | `behavior:ended` |
| `halted` | an intent **failed** (a real failure) | `behavior:halted` |
| `watchdog` | runaway content was **force-released** by the watchdog | `watchdog:forced-release` |
| `maxticks` | the tick cap was hit with the behavior **still running** | _(none — never terminated)_ |
| `aborted` | the caller's `shouldAbort` guard tripped | _(none — partial trace)_ |
| `idle` | no `run` was requested (or nothing ran); the sim just advanced | _(none)_ |

`watchdog` **wins** over the executor's own terminal event: the force-release is the
runaway guard, so if `watchdog:forced-release` is anywhere in the trace the outcome is
`watchdog` even though a `behavior:*` event fired first inside `forceRelease()`.

### `replay`

Re-simulates `input` and compares against a recorded expectation. The plan's minimum is
`replay(trace) → boolean`; this exceeds it — on mismatch it reports **where** it diverged
(debuggability is the point).

```ts
function replay(input: SimulateInput, expected: ReplayExpected, opts?: SimulateOptions): ReplayResult

interface ReplayExpected {
  hash: string                              // required — the recorded finalState hash
  traceLength?: number                      // optional — the recorded trace length
  trace?: { tick: number; type: string }[]  // optional — the recorded event sequence
}

interface ReplayResult {
  ok: boolean
  hash: string                              // the freshly-computed hash
  ticks: number
  outcome: Outcome
  divergence?: ReplayDivergence             // present iff ok === false
}

interface ReplayDivergence {
  kind: 'trace' | 'length' | 'hash'
  index?: number                            // for 'trace'/'length': first diverging trace index
  expected?: unknown
  actual?: unknown
  message: string
}
```

**Comparison order — most-specific first:** reference `trace` → `traceLength` → `hash`.

- If `expected.trace` is supplied, `replay` scans for the **first index** whose
  `tick`/`type` differs and returns `divergence.kind === 'trace'` with that numeric
  `index` (a divergence points at an *event*, not just a boolean). If the sequences
  agree but differ in length, that is `kind: 'length'`.
- Else if `expected.traceLength` differs → `kind: 'length'`.
- Else a pure hash mismatch (no reference trace) → `kind: 'hash'`, carrying both the
  expected and actual hash strings.

---

## 5. Trace vocabulary

Every event the engine emits (gathered from `emit(...)` call sites in
`packages/engine/src`). The trace is the primary assertion surface for acceptance
tests and the MCP debugging tool. **Terminal** events flip a behavior's `running()`
to false — `behavior:complete`, `behavior:ended`, `behavior:halted`, and
`watchdog:forced-release` are all terminal; nothing else is.

| event type | family | fires when | terminal |
|---|---|---|:---:|
| `behavior:start` | behavior | a behavior begins running | |
| `behavior:interrupted` | behavior | a running behavior is replaced by another | |
| `behavior:complete` | behavior | the behavior finished cleanly (no reason) | **✔** |
| `behavior:ended` | behavior | graceful end with a reason (e.g. `onBlocked`) | **✔** |
| `behavior:halted` | behavior | an intent failed — a real failure | **✔** |
| `watchdog:forced-release` | watchdog | runaway content force-released to safe idle | **✔** |
| `intent:start` | intent | an intent step begins | |
| `intent:complete` | intent | an intent step completed (carries `verb`) | |
| `intent:arrived` | intent | a `moveTo`/`jumpTo`/`flyTo` reached its target | |
| `intent:blocked` | intent | locomotion was blocked by geometry (carries rest `x`) | |
| `intent:failed` | intent | an intent could not be performed | |
| `intent:timeout` | intent | an intent exceeded its `timeoutMs` | |
| `intent:say` | intent | a `say` line was uttered (carries `text`) | |
| `intent:sfx` | intent | an `sfx` cue (carries `kind`, e.g. `whoosh`/`thud`/`bonk`) | |
| `intent:impulse` | intent | an `impulse` was applied (carries `vec`) | |
| `intent:emit` | intent | an `emit` (projectile/particle) fired | |
| `intent:camera` | intent | a `camera` cue | |
| `intent:attach` / `intent:detach` | intent | an accessory was attached/detached | |
| `intent:setFlag` | intent | a `setFlag` step | |
| `intent:branch` | intent | a `branchOnFlag` chose a branch | |
| `jump:launch` | locomotion | a jump left the ground | |
| `jump:land` | locomotion | a jump touched down | |
| `path:route` / `path:leg` | locomotion | a traversal route / one leg of it was planned | |
| `cue:strikePose` | cue | a milestone-anchored pose cue (carries `ref`) | |
| `cue:playClip` | cue | a milestone-anchored clip cue | |
| `cue:ignored` | cue | a cue was scheduled but had no valid milestone | |
| `reaction:run` | reaction | a reaction list ran (carries `trigger`, e.g. `onBlocked`) | |
| `rule:intent` / `idle:rule-intent` | rules | the interaction rule table produced an intent | |
| `cut` | world | a hole was cut in a damageable panel | |
| `cutRejected` | world | a cut was refused (would desync the representations) | |
| `healed` | world | a hole healed (segments/graph/render restored atomically) | |
| `hit` | world | a collision/projectile hit was registered | |
| `support` | world | a character was supported by a surface | |

---

## 6. Worked example — the Wall Test (ENGINE_V2 §1 north star)

**One** behavior doc, **two** worlds differing only in the spawn point against the same
live geometry. This is the north-star acceptance gate, run through `simulate()` in
`packages/headless/test/acceptance.walltest.test.ts`.

### Shared inputs

```ts
const BOX = { x: 100, y: 100, w: 200, h: 200 }
const GOAL = { x: BOX.x + BOX.w + 120, y: BOX.y + BOX.h / 2 } // outside the right wall

// A single 200×200 cell whose four edges are collidable segments, plus a goal entity
// outside the right wall.
const world: WorldDocV2 = {
  schemaVersion: 2, seed: 1,
  entities: [
    { id: 'cell', components: {
        transform: { x: BOX.x, y: BOX.y },
        surface:   { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } },
        collidable:{ shape: 'segments', segments: panelEdges(BOX) } } },
    { id: 'goal', components: { transform: { x: GOAL.x, y: GOAL.y } } },
  ],
}

// ONE behavior, byte-identical between both worlds — the whole point of the test.
const behavior: BehaviorDoc = {
  schemaVersion: 2, id: 'wall-run',
  steps: [{ verb: 'moveTo', target: 'entity:goal' }],
  reactions: { onBlocked: [
    { verb: 'strikePose', ref: 'squash-land', holdMs: 250 }, // the bonk (impact pose)
    { verb: 'say', text: 'ow!' },
    { verb: 'impulse', target: 'self', vec: [-140, -40] },   // backward — away from the wall
  ] },
}

const input = (spawn: { x: number; y: number }): SimulateInput => ({
  world,
  characters: [dashSpec({
    initialTransform: { x: spawn.x, y: spawn.y, rot: 0, facing: 1 },
    initialFeetY: BOX.y + BOX.h / 2,
  })],
  behaviors: [behavior],
  run: { characterId: 'dash', behaviorId: 'wall-run' },
  seed: 7,
})
```

### World A — enclosed (spawn at the box centre)

```ts
const res = simulate(input({ x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 }))
```

- `res.outcome === 'ended'`.
- Trace contains: `intent:blocked` → `reaction:run` (`trigger: 'onBlocked'`) →
  `intent:say` (`text: 'ow!'`) → `intent:impulse` (`vec[0] < 0`, i.e. backward) →
  `behavior:ended` (`reason: 'blocked'`).
- Trace contains **no** `intent:arrived` — the wall stopped it.

### World B — outside (spawn past the right wall)

```ts
const res = simulate(input({ x: BOX.x + BOX.w + 40, y: BOX.y + BOX.h / 2 }))
```

- `res.outcome === 'complete'`.
- Trace contains exactly one `intent:arrived`.
- Trace contains **no** `intent:blocked`, `reaction:run`, `intent:say`, or
  `intent:impulse` — the same doc traversed cleanly.

### Determinism

Running World A twice yields identical `hash`, identical `ticks`, and identical trace
`type` sequence — the Bun-scoped identity of §1. (Reference: World-A `hash` at the time
of writing is stable within the Bun runtime; assert equality across runs, never a
literal.)

---

## 7. Where this fits — the server integration

`simulate` / `validate` / `replay` are the substrate `POST /api/simulate` and
`POST /api/validate` wrap on the server (also Bun — same runtime, so the server
reproduces the local hash byte-for-byte, ENGINE_V2 §8 gate), and the exact shape a
future MCP tool wraps 1:1. Keep the surface small, JSON-in/JSON-out, and documented —
this file is that documentation.

**Server routes** (`server/routes/engine.ts`, both owner-gated behind `requireOwner`):

- `POST /api/validate` — body `{ doc }` → the `validate()` dispatch result.
- `POST /api/simulate` — body = a `SimulateInput` → the `SimulateResult`. Defense in
  depth on top of auth: 256 KB body limit (413), server-side `maxTicks` clamp
  (≤ 20 000), the §2 complexity caps (400, fast), and a 2 s wall-clock deadline via
  `shouldAbort` covering setup + ticks (422 with `{ticks, traceLength}` on abort).

**Notebook saves stay v1 until P9** (P8 review decision): `PUT /api/notebook`
dispatches **v1-first** (any doc with `version: 1` takes the legacy validator
byte-identically, even with a stray `schemaVersion` field); docs claiming
`schemaVersion: 2` are **rejected (422)** — `notebook_current` feeds the public GET
and the v1 admin, so no v2 artifact may ever become the live notebook before the P9
migration. The P9 save-flow dry-run policy, when it lands: only outcomes
`complete | ended` accept; `halted / watchdog / maxticks / aborted` all reject.

**The repeatable server gate** — `server/e2e/engine-check.ts` (NOT in CI; CI stays
DB-less). Boots the real app as a subprocess (migrate + seed + Better Auth),
authenticates via the dev magic-link, and asserts: the Wall-Test hash + trace length
byte-identical server-vs-local, the 401 boundary, the v2-save rejection (pointer
unmoved, GET unchanged), v1-first dispatch, cap rejection, and the maxTicks clamp.

```sh
# requires the dev Postgres container (dash-pg: postgres:16 @ localhost:5433, db `dash`)
bun server/e2e/engine-check.ts
# env (defaulted, overridable): DATABASE_URL, OWNER_EMAIL, BETTER_AUTH_SECRET,
#                               BASE_URL, ENGINE_CHECK_PORT (default 8791)
```
