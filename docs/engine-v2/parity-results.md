# Engine v2 parity recovery — results & evidence

> **Quality checkpoint reopened — 2026-07-13.** The owner reviewed the recovery
> branch live and rejected the current cape attachment/flight quality, walk
> smoothness, and overall pacing. The static expressive-skin coverage remains a
> pass, but the charm and integrated-motion gates are open. See
> `quality-review-2026-07-13.md` and `quality-plan.md`.

**Branch:** `vasim/engine-v2-parity-recovery` (single PR, one commit per stage)
**Plan of record:** `parity-plan.md` · **Acceptance contract:** `parity-acceptance.md`
**Visual target (Decision 1, owner-selected):** expressive data skin.

## What the recovery delivered, stage by stage

| Stage | Delivered | Gate evidence |
|---|---|---|
| S0 correctness | `runOneShot` (fidget/poke/drop/back-nav quips can never collide the behavior registry); migration loss report is a checked artifact; long-idle smoke; soak harness | 10-min soak: 86 cycles, 34 pokes, 17 drags, 17 navs, **zero errors, no wedge** |
| S1 laboratory | `window.__dashReview` (seed + forced choices, both routes); `scripts/parity-harness.mjs` (14 scenarios, dual-route strips + normalized timelines, console-fatal) | `--self-check` identical twice; `--negative-control` (hop-hang flip) detected |
| S2a acting layer | Cue `strikePose`/`playClip` ACT (concurrent layer, own blend envelope); `strikePose {hold:'persist'}`; camera `{mult,fast}` | 6+4 new tests; codex review: 1 blocker + 4 findings, **all fixed**; goldens byte-stable |
| S2b skins | The 24 legacy pose drawings + 38 keyframe animations as DATA (`content/engine/skins/`); renderer skin layer (parametric face rides the drawing's head; verlet cape stays engine-owned) | skins content gate (validation, animation resolution, exact charm durations); side-by-side crops |
| S2c slice | Multi-beat vault (+30% peek) with authored camera; persistent Fight arrival; full bomb back-nav (throw → arc → BOOM + hole → dive → page turn → pop-out at the last panel → land, legacy 4230ms) | slice strips + timelines, zero errors |
| S3 verbs | All 11 builtins re-authored to the legacy beat sheets; legacy geometry travel pools + combo gate + anti-repeat; trip/hang/peek/surf variants (forceable); poof choreography | per-verb strips; distinct silhouettes through the beats |
| S4 semantics | Geometric when-gates, arrival `face` (Fight faces LEFT again), persist arrivals, say `holdMs`, move `{pose, speed}`, camera targets + mult/fast, real fx overlays, arrival flourish (24% knock/shove/squish) | **loss report: ONE note** (accepted easing equivalence) |
| S5 charm | Full-zoom side-by-side review (idle near/far, Fight, Spray, Work, Skills) | crops verified by looking; residuals in the register below |
| S6 interaction | Legacy drag staging: dangle art + 'hey!! down!!' → nearest panel + 550ms tuck return arc → squash land → arrival re-strike → DROPS quip (always) | drag timeline matches legacy beat-for-beat |
| S7 integrated | Perf comparison below; HUD → semantic buttons (names, focus, aria state); `prefers-reduced-motion` mode | table below; smoke green both modes |

## Integrated performance (production build, real notebook route)

Scenario per run: page entrance + fight arrival → hop travel → page turn →
vault travel → 6s idle with fidgets. rAF frame deltas, 5-frame warmup dropped.

**No CPU throttle (reference desktop hardware):**

| viewport | route | avg ms | p95 ms | p99 ms | >50ms frames | heap Δ MB |
|---|---|---|---|---|---|---|
| desktop 1440×900 | legacy | 8.3 | 9.9 | 10.3 | 0.00% | 0.1 |
| desktop 1440×900 | engine | 8.3 | 9.8 | 10.2 | 0.00% | 1.7 |
| laptop 1280×720 | legacy | 8.3 | 9.9 | 10.3 | 0.00% | 0.2 |
| laptop 1280×720 | engine | 8.3 | 10.0 | 10.3 | 0.00% | 3.4 |
| tablet 768×1024 | legacy | 8.3 | 9.9 | 10.3 | 0.00% | 0.0 |
| tablet 768×1024 | engine | 8.3 | 9.9 | 10.3 | 0.00% | 2.0 |
| mobile 390×844 | legacy | 8.3 | 9.9 | 10.3 | 0.00% | 0.2 |
| mobile 390×844 | engine | 8.3 | 9.9 | 10.3 | 0.00% | 1.1 |

The engine route matches legacy frame-for-frame; the extra heap is the engine
scene (world + runtime + skins), rebuilt per page — not monotonic growth.
The camera-follow setState was measured, not assumed: no budget miss, so no
speculative rework (plan rule).

**4× CPU throttle:**

| viewport | route | avg ms | p95 ms | p99 ms | >50ms frames | heap Δ MB |
|---|---|---|---|---|---|---|
| desktop | legacy | 8.3 | 10.1 | 10.3 | 0.00% | 0.1 |
| desktop | engine | 8.3 | 10.1 | 10.3 | 0.00% | 1.1 |
| laptop | legacy | 8.3 | 10.1 | 10.3 | 0.00% | 0.6 |
| laptop | engine | 8.3 | 10.1 | 10.3 | 0.00% | 1.8 |
| tablet | legacy | 8.3 | 10.0 | 10.3 | 0.00% | 0.1 |
| tablet | engine | 8.3 | 10.0 | 10.3 | 0.00% | 1.3 |
| mobile | legacy | 8.3 | 10.0 | 10.3 | 0.00% | 0.1 |
| mobile | engine | 8.3 | 10.0 | 10.3 | 0.00% | 2.5 |

Even throttled 4×, both routes hold ~120Hz-capable frame times with zero long
frames — every acceptance threshold passes with wide margin, and the engine
never regresses against legacy.

Acceptance thresholds (parity-acceptance.md): p95 ≤ 16.7ms, p99 ≤ 33.3ms,
long frames < 1%.

**Bundle:** production `index.js` 532.7 kB vs 473.2 kB at the branch point —
**+12.6%**, inside the +15% budget (the 24 skin drawings + keyframe data +
recovery code).

## Known-difference register

| # | Scenario | Legacy | Replacement | Why | Evidence |
|---|---|---|---|---|---|
| 1 | All poses | Baked pennant cape per pose | ONE verlet cape (drapes with motion) | **Reopened:** owner reports visible detachment/excessive flight; hidden-rig socket and free-ribbon silhouette require redesign | 2026-07-13 live review |
| 2 | Page-surf variant | Dash rides ON the turning page | Rides in ABOVE the anchor after the flip lands | The engine actor lives in the new page's space; the flip animation hides it (double-actor guard) | S3 |
| 3 | Wallrun/slide climbs | Root visibly climbs/slides the wall face | Wall-pose beat at the wall + kick-over jump | No climb locomotion mode (closed verb set); silhouette/rhythm preserved | S3 strips |
| 4 | Idle/Spray eyes | JSX-parametric eyes in the art | The ENGINE parametric face (blink + look-at + dilation) on the drawing's head anchor | Strictly more alive; same geometry | S5 idle-near |
| 5 | Easing curves | Authored cubic-bezier per move | Locomotion solver profile (speed IS authored) | The one accepted migration loss — documented equivalence | loss report |

## Motion-quality recovery (Q0–Q7, branch vasim/engine-v2-quality)

The 2026-07-13 quality review reopened the charm checkpoint (five animation
systems without a shared clock/phase/anchor). Q0 built the instrument first;
Q1–Q6 removed each conflicting authority; measured before → after:

| Metric (Q0 motion recorder) | Before | After |
|---|---|---|
| Ground-anchor tremor while walking | 6.7–7.2 Hz at ±3.4 px (the dual gait) | **0 / 0** — one bob, the drawing's own |
| Ordinary walk speed | 112 px/s | **190.8 px/s** (legacy 190, with the 0.7–2.2 s bounds) |
| Vault/rope approaches | 112 px/s | **271 px/s** (legacy ~270); wallrun/slide 290, smash 260/220, combo 300 |
| Camera-target sawtooth | ~4 stepped updates/s chased by 0.9 s CSS | **0** — one establishing shot per travel + authored cue shots |
| Cape attachment | free verlet ribbon ~7 px off the hidden rig's neck (owner-rejected) | **authored legacy cape inside the drawing** (structurally attached) + bounded ≤0.16 rad velocity lag |
| Fixed-step presentation | rendered raw (micro-stutter class) | **interpolated at accumulator alpha**, teleports snap |
| Walk cycle time base | wall-clock CSS (0.8 s regardless of motion) | **distance-locked phase** (stride 152 px; refresh-rate invariant) |
| Speech bubble | white SVG lookalike | **the shared legacy ReactBubble** (yellow marker + pop-in) |
| Drag input | mouse events only | **pointer events** (touch parity, staged recovery included) |

Negative controls prove the instrument: injected root-stepping and a displaced
cape socket are both detected; the clean run is quiet. Regenerate the evidence
(metrics + 0.25×/1× flipbook clips per scenario) with:
`node scripts/motion-harness.mjs <outDir>` (add `--negative-control`).

Cape metric semantics (post-review): `sockSep` compares the RENDERED knot (live
CTM probe on the authored cape) against the expected placement — walk/idle sit
within the plan's ≤2px envelope (1.3px avg). Poses whose whole drawing shifts
(fightshift) carry the knot with the body BY DESIGN; the expectation model
excludes group animations, so their larger readings are placement-model
variance, not detachment (the knot is structurally inside the drawing).

Accepted edges (codex final review findings 4/8/11, documented):
- Refresh-rate invariance is by construction (distance phase) + throttle-
  induced irregularity — headless Chrome can't sweep literal 60/90/120Hz.
- A snapshot captured synchronously from a behavior:start listener restores
  before the per-run defaultSpeed installs (nothing in production snapshots
  from event handlers).
- The ordinary-walk 0.7–2.2s bound derives from straight-line distance; a
  graph-routed walk with hop legs can exceed the total (rare page geometries).

### Reopened-gate status after Q0–Q7

| Gate (quality review) | Status now |
|---|---|
| Walk timing | Legacy speed classes authored + walk duration bounds (Q4) |
| Walk motion | One phase, one bob, distance-locked (Q1); interpolated (Q2) |
| Cape charm | Authored legacy cape restored per pose (Q3) — owner reel to confirm |
| Camera smoothness | Authored shots; zero sawtooth (Q5) |
| Interaction feedback | Shared ReactBubble + pointer/touch drag (Q6) |
| Integrated smoothness | Motion metrics (not frame delivery) green at 1× and 4× throttle |
| Static skin coverage | Pass (unchanged) |
| Core engine correctness | Pass — sim untouched; goldens byte-identical |

### Acceptance record (owner to complete)

Per the quality plan, a capture script cannot close the charm gate. To record:
review date, scenarios watched live (`bun run dev`, `/` vs `/legacy` — walk,
vault, swing, smash, poof, bomb-back, poke, drag, fight/spray arrivals),
accepted/rejected differences, and the go/no-go decision.

## Final whole-branch codex review (S8)

238k-token independent read-only review: 6 blockers + 12 should-fixes.
16 fixed in the S8 commit (headline: travel arrivals were being silently
cleared by a call-order bug — the review earned its keep). 2 accepted as
documented deferrals (below). Categories engine-determinism / timers /
acting-contract / schema / migration all clean after fixes; the legacy
route was judged clean throughout.

## Remaining / deferred (explicit, per plan rule 3)

- Touch/pointer-event input path (drag is mouse-event based; taps work) —
  codex finding 17, accepted deferral.
- `prefers-reduced-motion` tames CSS animation only; engine locomotion and
  camera/page transitions keep full motion — codex finding 18, accepted
  deferral (story beats preserved; a full profile needs a motion-scale knob
  through the engine).
- Assistive reading order (all pages remain in the DOM; aria-hidden pass not done).
- Full scenario-matrix automation for rows C01/C02/U01–U04 (autoplay full-book
  run exists in soak form; matrix rows not individually asserted).
- Stage 5 micro-tuning is owner judgment by design — the live loops are the
  checkpoint (run `bun run dev`, compare `/` vs `/legacy`).

## Post-recovery quality review — 2026-07-13

The live checkpoint found that correctness and static pose coverage improved
substantially, but motion quality is not yet accepted. Primary open findings:

- expressive walk CSS and procedural gait run at unrelated phases;
- default engine walk is 111.6 px/s while legacy ordinary walk targets 190 px/s
  and signature approaches target roughly 260–290 px/s;
- the cape follows the hidden rig rather than the internally animated visible
  skin;
- travel camera updates every ~75 ms while easing each update for 450–900 ms;
- fixed-step presentation has no render interpolation;
- engine speech bubbles do not use the shared legacy visual component;
- Stage 5 still crops did not exercise dynamic walk/cape/camera quality.

The development architecture remains viable. Final acceptance is deferred until
the motion-quality plan passes and the owner approves the complete live journey.

## Parity 3 — owner live-review round (branch vasim/engine-v2-parity3)

Owner findings after the Q0–Q7 merge, each diagnosed and fixed:

| Owner report | Diagnosis | Fix | Evidence |
|---|---|---|---|
| "cursor below Dash → eyebrows double up" | The stand/spray skins carried the legacy Idle BAKED V-brow path (mislabeled "bandana ties" since extraction), layered under the parametric brows; visible when pupils dropped | Extractor FIXUPS drop the baked path (and stop re-injecting it); skins re-extracted | `shoot-brow.mjs` crops: two brow pairs below-cursor before, one after |
| "excessive rolling on some roll jumps… is there a bug?" | TWO bugs: (1) jump clip launch marker at 320 ms vs legacy 180 ms windup — every jump leg paid +140 ms; (2) onLaunch acting cues (roll's 900 ms tuck) outlived short ~460 ms hops and kept tucking into walk legs | (1) clip retimed (launch 180 / land 640 / end 860); (2) flight-scoped acting: onLaunch cues release at the next `jump:land`, serialized (`flightHold`) so snapshot/restore releases on the identical tick | Live capture: tuck active 548 ms of a 548 ms flight (hop: 742/742), **0 ms grounded tuck**; new engine test (60 s hold releases at the landing tick) |
| "legacy is a bit snappier, faster, slightly more fun" | The +140 ms per-leg windup was the dominant lag; Q4 pace was already at legacy classes | Same windup retime | Dual-route timelines: hop launch 183 ms vs legacy 186 ms, complete 1608 vs 1604 ms; roll complete 1683 vs legacy 1961 ms (engine now leads) |
| "legacy kept a flying page-to-page effect on plain flips" | The surf ride staging existed but played entirely while the layer was hidden behind the `busyFlip` visibility gate — Dash popped in post-landing | `surfFlip` state keeps the EngineLayer visible through a surf flip; staging rewritten to the exact legacy flipTo timeline from flip start (glide from the OLD page position 0–780 ms, tuck-drop 880, squash-land + shake 1240, arrival 1780) | Capture: old page mid-turn with Dash gliding at ~200 ms, surf stance over the new page ~500 ms, tuck ball ~1000 ms, landed ~1300 ms |

Also this round: the byte-exact traversal golden moved onto a pinned fixture of
the committed notebook pages (owner `/admin` content edits must never break
engine goldens; live content stays covered by the sanity/scoping invariants).

Marked by the owner as **engine upgrades for later** (not this branch):
IK-planted skin feet, a real climb mode (verb sign-off needed), a teleport
intent for poof, physics-assisted cape deformation.

## Parity 3b — "fix the actions" (same branch)

Owner: "some of them do not work, like wall run or swing." A clean-state
action × page matrix (10 verbs × pages 2–5, engine traces) found 21 failing
cells with one root cause: crossing beats authored as engine `moveTo`/`jumpTo`
fail where no route exists, while legacy crossed any geometry with fixed-tempo
tweens. Wallrun additionally approached via `travel:to#edge` (unreachable by
walk — its siblings all use `from`), and swing "completed" while reading
broken (a swing pose standing on the roof; the legacy bar hangs above the
panel corner, which no route can reach).

Fix pattern (the poof/hang staging precedent, applied systematically): the
engine runs the real approach legs and in-place beats; the adapter stages the
legacy crossing choreography verbatim (swing bar-hang + pendulum sag, wallrun
wall climb, vault 500 ms flight, rope 115 px/s balance glide, slide wall
descent, smash burst-through-crack). A hop/roll/combo whose every ballistic
arc the planner refuses (arc-clearance vs owner-edited geometry) recovers with
the legacy hopTo ARC instead of a poof — the verb the pool promised plays.

Matrix after: **37/40 ok**; the 3 remaining are forced-walk-across-chasm
dev-hook cells (organic pools exclude walk there — verified by forcing walk on
every adjacent pair; the poof escape covers the forced case). Zero page errors.

Deliberate legacy deviation for owner review: the smash exit bursts through
the crack as a tuck — legacy strolled it in the walk pose, but a scripted
glide cannot drive the distance-locked walk skin (frozen feet read worse).

Engine-upgrade candidates surfaced by this round (deferred, owner list):
ballistic arc-clearance in the jump planner's edge pruning is CONSERVATIVE
(refuses arcs legacy played); a climb mode would let wallrun's wall leg be a
real engine route; a rope/bar surface kind would do the same for swing/rope.
