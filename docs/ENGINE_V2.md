# Dash Engine v2 — Implementation Plan

**Purpose of this document:** A phase-by-phase build plan for replacing the Dash Notebook character engine with a layered, data-total character/world/behavior system. Written to be handed to a coding agent one phase at a time. Each phase is a single PR with an explicit verification gate; do not begin a phase until the previous gate is green.

**Amendments (2026-07-11, agreed with owner before Phase 0):**

1. **Editors ship online, auth-gated** — not dev-only. The backend increment (PR #5) put the admin in prod behind Better Auth; Dojo v2 keeps that: a prod lazy chunk gated by the existing session check. Phase 10's gate is "editor chunk loads only behind auth", not "absent from dist".
2. **Phase PRs merge into master continuously.** `packages/*` is dead code the live site doesn't import until Phase 9 flips it. No long-lived v2 branch — the owner edits content live via the admin, and a months-long branch would guarantee content conflicts at cutover.
3. **Phase 9 includes porting the whiteboard core** (panel/box/arrival editing) to the new schema, so content editing never breaks between P9 and P10.
4. **Additive repo layout** — keep `src/` (site + admin) where it is; add `packages/*` as bun workspaces. No `src/ → site/` move, no `editor/` split.
5. **Migration is a script**, not a hand-edit — see Phase 9. Old DB revisions remain valid v1 history; the friend-submission subset survives.
6. **Panel content boxes stay render-layer** — explicitly outside the component model (§2).
7. **Determinism is scoped per-runtime** (Bun) and hashes use float bit patterns (§3 rule 1).
8. **Locomotion capabilities are `CharacterDoc` data** consumed by the Phase 6 traversal graph — breaks the P6↔P7 circularity and serves the Bird Test (§5).

---

## 1. Context

Current state (master, post PR #5): Dash is 24 static SVG pose components swapped by a React class state machine; motion is CSS keyframes; locomotion is picked from travel pools; custom actions compile to absolute-time cues with a watchdog. Content lives in `notebook.json` (dev/seed/fallback) with prod truth in Postgres `notebook_revisions`, validated by a hand-rolled validator shared by client and the Bun/Hono/Drizzle backend. An auth-gated whiteboard admin ("Dash Dojo") edits content in prod and dev; a friend-invite pipeline accepts text+draw panel submissions.

Target state: characters are instances of rig templates; motion is continuous (pose blending + procedural controllers + a shared verlet solver); the notebook is a reactive world (surfaces, props, ropes, cuttable panels); behaviors are runtime-resolved *intents* that can succeed, be blocked, or fail, with authorable reactions; everything is expressible as validated data; a headless simulate API replays any scenario deterministically. The old engine is fully removed at the end. Clean slate on the engine is acceptable; the notebook site shell and backend are kept and adapted.

**North-star acceptance tests (built for from day one, verified in Phase 11):**

- **BIRD TEST** — A new winged character that flies through panels emitting projectiles that cut holes in panels can be created *entirely as a JSON document* that validates against the schema. Zero engine code changes.
- **WALL TEST** — The behavior "run and jump to the next panel," executed with the character enclosed by a panel wall, produces a run, a collision event, and an authored bounce reaction. The identical behavior definition, with the character repositioned outside the wall (e.g. moved in the admin), produces a clean traversal. One behavior, both outcomes, both assertable headlessly from event traces.

---

## 2. Architecture (fixed — do not redesign mid-build)

Per-frame derivation order. Higher layers command; lower layers decorate. Physics never drives intent.

```
L6  BEHAVIOR      intents (moveTo, jumpTo, emit, say…) + reaction rules + cue performance layer
L5  WORLD         entities/components, panel geometry & surfaces, collision, traversal graph,
                  mutable boundaries (holes + heal), interaction rule table
L4  LOCOMOTION    runtime movement solver: advances characters against world geometry,
                  raises events (blocked, landed, fell)
L3  SECONDARY     ONE shared verlet/spring solver: character follow-through, props
                  (spring-anchored, always come home), ropes, accessories; impulse API; sleeping
L2  PROCEDURAL    always-on controllers: breathing, blink, weight shift, look-at,
                  two-bone IK (feet/hands), gait generators; scaled by personality params
L1  POSES/CLIPS   poses = named joint configurations; clips = keyframed pose tracks with easing;
                  blend tree: crossfade + additive layers; no hard pose swaps ever
L0  RIG           joint hierarchy templates + constraints; characters = template + parameter
                  overrides (proportions, style, accessories, personality)
    RENDER        rAF loop writes SVG transforms directly (no React reconciliation per frame)
```

**Data-total rule:** every capability (character, ability, effect, behavior, world object) must be creatable as validated data. If adding content requires touching `packages/engine`, the design is wrong — fix the schema, not the content.

**Panel content is render-layer, not components:** the whiteboard boxes panels carry today (text / draw / art) remain a property of panel entities that only the renderer reads. The engine never simulates them; they never enter the component model. Not everything must become a component.

**Closed verb & component sets (v1 — additions require explicit owner sign-off, never agent initiative):**

- Intents: `idle, moveTo, jumpTo, flyTo, flyThrough, playClip, strikePose, say, sfx, camera, wait, emit, impulse, attach, detach, setFlag, branchOnFlag`
- Reaction triggers: `onArrive, onBlocked, onLand, onHit, onDisturbed, onTimeout, onProjectileHit`
- Components: `transform, rigInstance, locomotion, collidable, surface, disturbable, damageable, emitter, projectile, attachment, speech`
- Interaction rule table rows: `(componentA × componentB × event) → responses`. Seed rows: projectile×damageable→cut; character×wall→blocked event; character×disturbable→impulse; character×surface→support.

---

## 3. Repo structure & engineering rules

Additive bun workspaces around the existing app — `src/` does not move:

```
packages/
  schema/        types (TS), JSON-schema/validator, versioning, migrations   — zero deps
  engine/        pure TS, NO DOM imports: sim loop, L0–L6                    — depends on schema
  renderer-svg/  DOM writer: engine state → SVG transform/attr writes        — engine, schema
  headless/      simulate(doc, behavior, world) → event trace + state; replay — engine, schema
src/             notebook React app + admin (auth-gated Dojo) — unchanged location;
                 mounts engine + renderer at P9; admin evolves into Dojo v2 at P10
server/          existing Bun/Hono/Drizzle; gains /api/validate, /api/simulate
```

**Delivery model:** one phase per PR, every PR merges into **master**. Until Phase 9, nothing under `packages/` is imported by the site — the live notebook keeps running the legacy engine, the owner keeps editing content, and every phase leaves master shippable.

Non-negotiable rules (enforce in CI from Phase 1):

1. **Determinism.** Fixed-timestep simulation (accumulator pattern; sim at 120 Hz, render interpolated). Seeded PRNG (e.g. mulberry32) threaded through engine context. ESLint rule bans `Math.random`, `Date.now`, `performance.now` inside `packages/engine` and `packages/headless`. All engine state serializable to JSON; a state hash function exists from Phase 1. **Scope:** replay/hash identity is guaranteed *within one runtime* — Bun (headless, server, CI). Browsers run a different JS engine (V8 vs JSC) whose transcendental functions (`sin`/`cos`/`exp`) are implementation-defined; never assert cross-runtime hash equality. The state hash consumes float *bit patterns* (`Float64Array` → bytes), never string formatting.
2. **Engine is DOM-free.** `packages/engine` and `packages/headless` must run in plain Node/Bun. CI runs the headless suite without a browser.
3. **Perf budget.** Per frame at 60 fps with 2 characters + 1 rope + 10 props + 4 projectiles: sim ≤ 2 ms, render writes ≤ 2 ms, zero per-frame React renders, zero per-frame allocations in hot loops (pool or reuse). Springs/props sleep when settled (≥ 90 % of props asleep during idle).
4. **Verification-gated PRs** (continue the PR #5 style): typecheck/build clean; headless suite green; screenshot review where visuals change; editor code loads only behind the auth gate (lazy chunk, session-checked — it *does* ship in prod, per the online admin); independent review pass on engine-math phases (P3, P5, P6, P7).
5. **Non-goals:** 3D, canvas/WebGL, third-party physics engines, multiplayer, server-side frame simulation. SVG + math only. (The renderer sits behind an interface anyway — see P0 exit criteria.)

---

## 4. Phases

Sizing note: t-shirt sizes are relative effort, for sequencing and PR-splitting judgment — S ≈ a focused session, M ≈ a day-scale increment, L ≈ should be split into 2–3 PRs internally.

### Phase 0 — Spikes (throwaway; timeboxed; no gate reviews, only findings) — size M

Two disposable prototypes. Code is deleted afterward; the deliverable is a findings doc with numbers.

- **Spike A — Verlet + SVG render perf.** One 15-joint verlet chain character (draggable, flops believably), one 20-particle rope that sags under a weight, three spring-anchored wobble props. Single rAF loop writing SVG transforms via direct element refs. Measure: sim ms/frame, style-write ms/frame, FPS on a throttled CPU (4× slowdown). Try `transform` attribute vs CSS transform vs `<use>` instancing; record which wins.
- **Spike B — Blend layering.** FK skeleton, two hand-authored poses, crossfade between them while an additive "breathing" sine and a verlet-lagged arm run on top. Prove: no jitter, no fighting, velocity-continuous transitions. Document the composition order and the math that worked (angle lerp w/ shortest-arc; additive applied post-blend, verlet targets fed from post-additive pose).

**Exit criteria:** findings recorded (`docs/engine-v2/spike-findings.md`); go/no-go on direct-SVG rendering (if style writes > 2 ms, note that renderer interface must allow a future canvas impl — do not build it now); blend composition order fixed and written into this plan's Phase 3/5 specs.

**Status: COMPLETE (2026-07-11).** Direct-SVG rendering is a **GO** — all three write modes measured ~25–30× under budget at 4× CPU throttle; no repeatable winner, so the renderer writes bone/rope geometry attributes directly from world-space joints and uses CSS transforms for grouped/prop elements (clarity over a nonexistent perf difference). The proven composition order is now normative in Phases 3/5 below; full numbers, tuning values, and gotchas (linecap × non-uniform scale trap, SVG attr unit rules, CDP throttle caveats) in the findings doc.

### Phase 1 — Foundations: sim loop, schema package, CI — size M

Build: `packages/schema` skeleton (doc envelope with `schemaVersion`, validator harness, error format matching current validator ergonomics); `packages/engine` core: fixed-timestep loop with accumulator + interpolation alpha, engine context (seeded RNG, event bus, clock), state serialization + hash; `packages/headless` skeleton: `createSim(worldDoc) → step(n) → snapshot()/hash()/trace()`. CI: typecheck, unit tests, determinism lint rules, headless-runs-in-node check.

**Gate:** replay identity test — same seed + same scripted inputs → identical state hash after 10,000 ticks, run twice locally and once in CI. Determinism lint active and passing.

### Phase 2 — Rig & poses (L0–L1a) — size M

Build: `RigTemplate` schema (joint tree, bone lengths, angle limits, bend direction hints); `CharacterDoc` = template ref + overrides (proportion scalars, line style, palette, accessory attachment points, personality params `{energy, bounciness, confidence, sloppiness}` — params are plumbed now, consumed in P4/P5) + **locomotion capabilities** (modes + numeric caps: max jump height/distance, fly speed — plumbed now, consumed by P6's traversal graph and P7's solver); `Pose` = named map of joint angles (+ optional root offset); FK solver; `renderer-svg` draws a character from solved world-space joints (stroke style from doc). Author 6 of the existing 24 poses as data (pick spread: stand, walk-mid, jump-tuck, cheer, think, squash-land) by eyeballing against the old SVGs.

**Gate:** golden-frame tests (solved joint positions snapshot per pose, tolerance ±0.1 px); side-by-side screenshot review of the 6 poses vs legacy renders — "recognizably Dash" is the bar, not pixel parity.

### Phase 3 — Clips & blend tree (L1b) — size M

Build: `Clip` schema (tracks of pose keyframes, per-key easing from a preset curve set, loop flags, events-on-time markers); clip player; blend tree with exactly two mechanisms — **crossfade** and **additive layers** — using the composition order proven in Spike 0-B (normative):

1. Base blend: per-joint **angle-aware critically-damped SmoothDamp** carrying a persistent per-joint velocity that is never reset — a crossfade is nothing but a change of target, so interrupts continue from current position *and velocity* (Spike B: interrupt pop 1.04× a normal transition vs 13.85× for fixed-duration eased lerp). Shortest-arc via `wrapPi(a) = atan2(sin a, cos a)`; `smoothTime ≈ durationSec × 0.6`; linear variant for root offsets.
2. Additive layers: weighted joint deltas added into a **throwaway per-tick buffer, never written back into blend state** (feedback drifts the integrator). Angular additives pre-FK; positional additives after the base root offset.
3. FK solves the post-additive pose; secondary (P5) targets the post-additive result; render interpolation (two most recent sim snapshots, accumulator alpha) is the last step and never touches sim state.

Author 3 clips: idle-shuffle, walk-cycle, jump (anticipation → launch → tuck → land-squash → settle).

**Gate:** unit tests on interpolation math; numeric no-pop test (max joint angular velocity discontinuity across any transition < threshold); headless clip playback trace snapshot; independent review of the blend math.

### Phase 4 — Procedural controllers (L2) — size M

Build: always-on controllers as additive contributors — breathing oscillator (chest/shoulders), blink timer, weight-shift (slow hip sway), look-at (head + pupils toward a target point; cursor on site, scriptable headlessly); two-bone analytic IK for legs (foot planting on surfaces — consumes a support height, full surface model arrives in P6, until then a flat floor stub) and arms (reach targets); gait generator: walk/hop parameterized by stride, cadence, bounce — replacing fixed-keyframe locomotion clips for ground movement (the P3 walk clip becomes a fallback/reference). Personality params scale controller amplitudes and gait character.

**Gate:** "never still" assertion — headless: over any 2 s idle window, joint-angle variance > ε for ≥ 6 joints; IK foot-lock error < 0.5 px during a walk across a flat floor; look-at tracks a scripted moving target in trace. Screenshot/video review of idle: it must read as *breathing*, not vibrating.

### Phase 5 — Shared verlet solver (L3) — size M/L

Build: one solver instance per world — point particles, distance + pin constraints, relaxation iterations (fixed count: **4**, held 37 simultaneous constraints without stretch in Spike A), gravity (~1600 px/s² read right), damping (start ~0.96–0.97 per substep; Spike A's 0.985 settled too slowly after a hard yank); **character secondary**: light chains (forearms, head, accessory points) whose constraint targets follow the post-L2 (post-additive) pose — targeting the pre-additive pose strips the breathing from the follow-through and reads dead — with a hard length constraint to the FK anchor so positional lag becomes *angular* follow-through, not stretch (Spike B starting point: stiffness 0.28, damping 0.86, 2 iterations/tick); **props**: `disturbable` bodies spring-anchored to authored rest transforms (always come home; anchor stiffness per prop); **ropes**: particle chains between anchors, characters can load them (tightrope sag); **impulse API**: the only ways energy enters are behavior `impulse` steps and user input (poke/drag) — nothing else may inject forces; **sleeping**: bodies below energy threshold stop simulating and drop from the render-dirty set. Drag interaction rebuilt on this layer (drag Dash → limbs trail; release → settle to pose).

**Gate:** headless replay of a scripted drag produces identical trace twice; settle-time bounds (prop disturbed by standard impulse returns to < 0.5 px of rest within N s, N per stiffness class); sleep coverage ≥ 90 % at idle; perf re-measured against budget. Independent review.

### Phase 6 — World model (L5) — size L (split: 6a geometry/collision, 6b mutability/rules)

**6a — Entities, geometry, collision, traversal.** Build: ECS-lite (`WorldDoc` = entities with typed components; no systems framework — plain update functions in fixed order); panels become entities with `surface` components exposing typed geometry: floor, roof, left/right walls, interior region, edges (the current panel-relative anchor model maps onto "interior spot" / "roof spot"); collision: character = capsule (or point + radius pair), props = AABB, panels = segment sets; swept tests so fast movers can't tunnel; collision produces *events* (`blocked`, `landed`, `hit`) — resolution (bounce, stop, slide) is decided by rules, not hardcoded; traversal graph auto-built from surfaces + gaps (nodes = standable spots, edges = walk/hop/jump/fly reachability, computed from each character's declared locomotion capabilities in `CharacterDoc` — never from P7 solver internals) replacing hand-authored travel targets.

**6b — Mutable boundaries + interaction rule table.** Build: `damageable` panels support runtime boundary cuts ("holes"): a cut updates rendering (torn comic edge mask), collision segments, and traversal graph *atomically*; heal policy per mutation (`healAfterMs` default — the notebook redraws itself; `persistScope: none | session | saved` as schema knob, only `none`/`session` implemented now); interaction rule table as data: `(componentA, componentB, event) → response list` seeded with the rows from §2; world state queryable (`isEnclosed(entity)`, `nearestSurface`, `holesInPanel`).

**Gate 6a:** unit tests: swept collision vs walls at high velocity (no tunneling); traversal graph snapshot for the real notebook layout; enclosed-character detection correct. **Gate 6b:** the three-representation consistency test — cut a hole headlessly, assert render mask, collision segments, and traversal graph all changed coherently and heal restores all three; rule table rows covered by trace tests. Independent review.

### Phase 7 — Behavior runtime (L4 + L6) — size L (split: 7a locomotion/intents, 7b reactions/cues/watchdog)

**7a — Intents + locomotion solver.** Build: `BehaviorDoc` = list of intent steps (closed verb set); the locomotion solver advances a character toward an intent target each tick against world geometry (ground: gait from P4; airborne: ballistic jump arcs with authored anticipation/landing clips; fly: steering for `flyTo`/`flyThrough`); movement can be **blocked** (raises event, intent enters `blocked` state), **complete** (`onArrive`), or **timed out**. This *replaces* compile-to-absolute-time cues for movement.

**7b — Reactions, performance cues, failure, watchdog.** Build: reaction rules on behaviors and characters (`onBlocked → [playClip bonk, say "ow!", impulse self backward]`) — data, drawn from the same verb set; performance cues (`say/sfx/strikePose/camera`) scheduled relative to **intent milestones** (`onLaunch`, `onLand`, `onArrive`, `onBlocked`) not absolute times; every intent has `timeoutMs` + authorable give-up reaction (default: shrug-and-sit); watchdog guarantees return-to-safe-idle regardless of authored content (busy latch + force-release, porting the current per-run finished-latch semantics); `branchOnFlag`/`setFlag` for the existing one-shot arrival idiom.

**Gate:** **THE WALL TEST passes headlessly** — one behavior doc, two world states, traces assert bounce-with-reaction vs clean traversal; timeout/give-up trace test; watchdog force-release test (malformed behavior can never wedge the character); migration dry-run: 3 of the 11 legacy built-ins (hop, vault, tightrope) re-authored as behavior docs and verified by trace. Independent review — this is the riskiest phase.

### Phase 8 — Headless API + server integration — size S/M

Build: promote `packages/headless` to the stable outward surface: `validate(doc)`, `simulate({world, behavior, seed, maxTicks}) → {trace, finalState, hash}`, `replay(trace) → boolean`; rebuild the repo's check harness on it (the shoot/smoke/superset successors); server: `POST /api/validate`, `POST /api/simulate` (Bun runs the same packages — no browser), wired into the existing revision flow so a save can be validated + dry-run before commit. This API is deliberately shaped as the substrate a future MCP tool will wrap 1:1 — keep the surface small, documented, and JSON-in/JSON-out.

**Gate:** server simulate returns byte-identical trace hash to local for the Wall Test scenario (both Bun — same runtime, per §3 rule 1); harness suite green in CI without a browser.

### Phase 9 — Site integration & legacy removal — size L

Build: mount engine + renderer in the notebook site (single rAF controller; React owns pages/camera/HUD chrome, engine owns characters/props per the perf rule); **content migration as a committed script** — `migrateDoc(v1 → WorldDoc)` in `packages/schema/migrations`, run at cutover on the *then-current* DB doc (the owner keeps editing until the flip): old revisions stay valid v1 history, the migrated doc lands as a new revision; migrate the remaining 18 poses as pose docs, all 11 built-ins as behavior docs, travel pools → traversal-graph behavior selection (weighted, gated by the same `when` conditions), arrivals → `onArrive` reactions, Pip re-authored as a second character instance (flight verb) on the shared rig template with bird proportions; **server validator swap** — `server/` imports move from `src/notebook/doc/validate.ts` to `packages/schema`, and `validateSubmissionPanel`'s subset (text+draw boxes, geometry/count caps) is re-expressed against the new schema so the invite/inbox pipeline keeps working unchanged; **whiteboard-core port** — panel/box/arrival editing in the admin re-pointed at the new schema (same UI), so content editing never breaks while the full Dojo v2 arrives in P10; cursor eye-tracking, poke, drag rebuilt on L2/L3/L6 inputs; delete the legacy engine (state machine, 24 pose components, CSS keyframe locomotion) and the old cue compiler.

**Gate:** page-by-page screenshot review vs pre-migration baseline (bar: equal-or-better charm, not parity — expect it to look *more* alive); full smoke suite (nav, poke, drag, autoplay, audio) zero console errors; migration round-trip check (migrate the live doc, validate, render every page); admin can still edit panels/boxes/arrivals and save through revisions; invite submission → inbox → approve still works end-to-end; bundle-size budget: prod JS ≤ current dist + 15 %; grep-verified zero legacy imports remain.

### Phase 10 — Editors (Dojo v2) — size L (split per tool; comic/whiteboard aesthetic throughout; ships in prod as an auth-gated lazy chunk, like today's admin)

- **10a Character designer:** template picker; sliders for proportions + personality; palette/line style; accessory attach; live preview = the real engine running idle (personality sliders visibly change the idle *motion*, not just looks). Saves `CharacterDoc`.
- **10b Clip timeline:** pose keyframes on tracks, drag keys, easing-preset picker per key, scrubbing, onion-skin ghosts (previous/next key at low opacity), per-joint override lane, ▶ preview on the real runtime. Styled as a flipbook margin, not After Effects. Saves `Clip` docs.
- **10c Behavior composer:** evolution of the sentence-style Dojo — numbered intent sentences with dashed-underline fields, reaction sub-sentences ("…and if he hits a wall, he *bonks* and says …"), milestone-anchored cue chips, ▶ try-it runs a real traversal in preview, event trace rendered as a comic-caption log for debugging.
- Shared plumbing: undo/redo, dirty tracking, validation strip, save through `/api/validate` + revisions — all ported from the current admin.

**Gate:** e2e per tool (author → save → reload site → new content live); editor chunk loads only behind the auth gate (unauthenticated users never receive editor code paths; lazy-chunk split verified); screenshot review against the whiteboard aesthetic; the P·0N tag / anchor-marker ergonomics of the current admin are preserved or improved.

### Phase 11 — Acceptance & polish — size M

Build: **run the BIRD TEST for real** — author `birb.json` (winged character, `flyThrough` patrol, eye `emitter`, laser `projectile`, holes that heal) with zero engine changes; if anything requires code, file it as a schema defect and fix the schema; perf soak (2 characters + projectiles + holes + ropes, 60 s, budget held); content pass: re-tune Dash's personality params, arrivals, and 2–3 new signature stunts using only the editors; both acceptance tests added to CI as permanent regression gates.

**Gate:** Bird Test and Wall Test green in CI; perf numbers recorded; a written "content author's guide" (how to make a character/clip/behavior with no code) — this doubles as the future MCP tool's documentation.

---

## 5. Schema sketches (contracts for Phase 1–2; agent refines, does not redesign)

```ts
type PersonalityParams = { energy: number; bounciness: number; confidence: number; sloppiness: number }; // 0..1

interface RigTemplate { id: string; joints: JointDef[]; /* tree via parentId */ chains: IkChainDef[]; secondarySlots: string[]; }
interface JointDef { id: string; parentId: string | null; length: number; limits?: [number, number]; bendHint?: 1 | -1; }

// Locomotion capabilities are DATA here so the P6 traversal graph can compute
// reachability without depending on P7 solver internals (and so the Bird Test
// stays code-free): modes + numeric caps.
type LocomotionCaps = { modes: ("walk"|"hop"|"fly")[]; maxJumpHeight?: number; maxJumpDistance?: number; flySpeed?: number };

interface CharacterDoc { id: string; rig: string; proportions?: Record<string, number>; style?: StrokeStyle;
  personality: PersonalityParams; locomotion: LocomotionCaps; components?: ComponentDoc[]; }

type Pose = { id: string; angles: Record<string, number>; root?: {x:number;y:number;rot:number} };
interface Clip { id: string; tracks: { jointId: string; keys: {t:number; angle:number; ease:EasePreset}[] }[];
  loop?: boolean; markers?: {t:number; event:string}[]; }

type Intent =
  | { verb:"moveTo"|"jumpTo"|"flyTo"|"flyThrough"; target: TargetRef; timeoutMs?:number }
  | { verb:"playClip"|"strikePose"; ref:string; blendMs?:number }
  | { verb:"say"; text:string } | { verb:"sfx"; kind:SfxKind } | { verb:"wait"; ms:number }
  | { verb:"emit"; emitter:string; count?:number } | { verb:"impulse"; target:EntityRef; vec:[number,number] }
  | { verb:"setFlag"; flag:string } | { verb:"branchOnFlag"; flag:string; then:Intent[]; else?:Intent[] };

interface BehaviorDoc { id: string; steps: Intent[]; reactions?: Partial<Record<ReactionTrigger, Intent[]>>;
  cues?: { at: Milestone; do: Intent }[]; when?: GateExpr; }

interface RuleRow { a: ComponentKind; b: ComponentKind; event: string; responses: Intent[]; }
```

`TargetRef` resolves against the world at runtime (`panel:work#roof`, `entity:pip`, `nearest:surface`) — never raw coordinates in authored content (coordinates allowed only as authored rest transforms in `WorldDoc`).

## 6. Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Layer fighting / jitter (L1+L2+L3 compose badly) | 3–5 | Spike B fixes composition order before any real code; numeric no-pop + never-still gates; independent review on P3/P5 |
| SVG render perf misses budget | 0, 5, 9 | Spike A measures first; renderer behind interface; sleeping + dirty-set rendering; budget re-measured at P5 and P9 gates |
| Verb/component scope creep ("just one more ability") | all | Closed sets in §2; additions require owner sign-off in the PR description; Bird Test defines "enough" |
| Determinism leaks (hidden clock/random) | all | Lint bans from P1; replay-identity test runs in CI forever; guarantees scoped to Bun (never cross-runtime hash asserts) |
| Wall-Test semantics gut the authored feel (movement too "simmy") | 7 | Intents carry authored clips for launch/land; performance cues on milestones; P7 gate includes re-authoring 3 legacy built-ins and reviewing feel |
| Migration loses charm (new Dash reads worse than old) | 9 | Gate is human screenshot review with the old build side-by-side; personality params tuned in P11 content pass |
| Migration loses content or breaks the backend | 9 | Migration is a committed script run on the then-current DB doc; old revisions stay v1 history; invite/submission subset re-expressed and e2e-tested at the P9 gate |
| Owner locked out of editing between P9 and P10 | 9 | Whiteboard core (panel/box/arrival editing) ports to the new schema inside P9 — editing never breaks |
| Editor previews drift from runtime | 10 | Previews embed the production engine — building a second implementation is forbidden |

## 7. How to run this with an agent

One phase per session/PR. Paste this document plus the single phase section as the task. Require the agent to: (1) restate the gate as executable checks before writing code; (2) keep the phase's out-of-scope items out (especially schema/verb additions); (3) land the verification harness *in the same PR* as the feature; (4) end with the gate evidence (test output, screenshots, perf numbers) in the PR description, in the style of PR #5's commit messages. Phases 3, 5, 6, 7 additionally get an independent model review before merge.

Independent reviews run via `codex exec -s read-only "$(cat prompt.txt)" > review.log 2>&1` directly through background Bash — never via a polling wrapper agent (a pgrep-based watcher once matched its own command line and hung for 40+ minutes).
