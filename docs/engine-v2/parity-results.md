# Engine v2 parity recovery — results & evidence

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
| 1 | All poses | Baked pennant cape per pose | ONE verlet cape (drapes with motion) | Engine-owned charm, owner-reviewed in earlier passes; physical follow-through everywhere | S5 crops |
| 2 | Page-surf variant | Dash rides ON the turning page | Rides in ABOVE the anchor after the flip lands | The engine actor lives in the new page's space; the flip animation hides it (double-actor guard) | S3 |
| 3 | Wallrun/slide climbs | Root visibly climbs/slides the wall face | Wall-pose beat at the wall + kick-over jump | No climb locomotion mode (closed verb set); silhouette/rhythm preserved | S3 strips |
| 4 | Idle/Spray eyes | JSX-parametric eyes in the art | The ENGINE parametric face (blink + look-at + dilation) on the drawing's head anchor | Strictly more alive; same geometry | S5 idle-near |
| 5 | Easing curves | Authored cubic-bezier per move | Locomotion solver profile (speed IS authored) | The one accepted migration loss — documented equivalence | loss report |

## Remaining / deferred (explicit, per plan rule 3)

- Touch/pointer-event input path (drag is mouse-event based; taps work).
- Assistive reading order (all pages remain in the DOM; aria-hidden pass not done).
- Full scenario-matrix automation for rows C01/C02/U01–U04 (autoplay full-book
  run exists in soak form; matrix rows not individually asserted).
- Stage 5 micro-tuning is owner judgment by design — the live loops are the
  checkpoint (run `bun run dev`, compare `/` vs `/legacy`).
