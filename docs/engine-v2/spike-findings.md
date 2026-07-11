# Dash Engine v2 — Phase 0 spike findings

Two throwaway prototypes (Spike A: verlet + SVG render perf; Spike B: blend layering),
built and measured 2026-07-11. The spike code was committed once for reference
(`ec0d7fd`) and removed before merge — this document and the amendments to
`docs/ENGINE_V2.md` Phases 3/5 are the deliverables.

---

## Spike A — Verlet + SVG render perf: **GO on direct-SVG rendering**

Scene: one 15-joint verlet chain character (draggable), one 20-particle rope with a
mid-rope weight, three spring-anchored props — 52 transformed SVG elements/frame, one
rAF loop, 120 Hz fixed-step sim with accumulator, 4 constraint relaxation iterations.
Measured headless (puppeteer-core + system Chrome, 1440×900) under active agitation.

### Numbers

CPU throttled 4× (CDP `Emulation.setCPUThrottlingRate`):

| mode | fps   | simMs avg / p95 | writeMs avg / p95 |
|------|-------|-----------------|-------------------|
| attr | 120.0 | 0.008 / 0.1     | 0.057 / 0.2       |
| css  | 120.1 | 0.007 / 0.1     | 0.071 / 0.2       |
| use  | 120.1 | 0.007 / 0.1     | 0.066 / 0.2       |

Unthrottled: same shape (write avg 0.16–0.19 ms), fps pinned at 120 in every run.

### Verdict

- **All modes are ~25–30× under the §3 budget** (sim ≤ 2 ms, writes ≤ 2 ms) even
  throttled. Perf is not the constraint at notebook scale; the renderer-interface
  escape hatch (future canvas impl) stays a note, nothing gets built.
- **No repeatable winner between `transform` attribute, CSS transform, and `<use>`** —
  differences were within run-to-run noise. Choose by clarity, not speed:
  **for bones/rope segments, write geometry attributes directly** (`x1/y1/x2/y2`,
  `cx/cy`) from solved world-space joints — no transforms at all; **for
  transformed groups/props, use CSS `style.transform`** (accepts explicit units incl.
  `rad`; matches the existing codebase idiom from the pupil-tracking fix).
- Two honest caveats: (1) measured `writeMs` is JS-side write cost — rasterization
  isn't in that number, but fps holding 120 under 4× throttle covers the full pipeline
  indirectly; (2) CDP throttling did not uniformly scale sub-0.1 ms workloads (one run
  measured throttled < unthrottled), so treat the throttled numbers as indicative, not
  a strict upper bound. Neither changes the go.

### Tuning + gotchas (carry into Phase 5)

- **4 relaxation iterations** held 37 simultaneous constraints without visible stretch.
- Gravity 1600 px/s², per-substep damping 0.985 read believably but settles slowly
  after a hard yank — production should start around **0.96–0.97** for snappier settle.
- **Rendering-correctness trap (the spike's real find):** `createElementNS` defaults all
  geometry attributes to 0, and `stroke-linecap: round` on a zero-length line renders a
  full circle — which a non-uniform `scale(len, 1)` "unit segment" transform stretches
  into a needle. The scene exploded into a star until (a) base geometry attributes were
  set explicitly on every element and (b) linecap switched to `butt` for scale-to-length
  segments (round caps are fundamentally incompatible with non-uniform scale — the cap
  radius stretches with the length). Direct endpoint writes (the recommendation above)
  sidestep the whole class.
- SVG `transform` **attribute** takes unitless degrees/user-units (radians must be
  converted); CSS `style.transform` takes explicit units including `rad`.

---

## Spike B — Blend layering: **composition order proven, no-pop verified**

FK stick skeleton (13–15 joints), two poses (STAND / CHEER), crossfade + additive
breathing + verlet-lagged forearms & head, 120 Hz fixed step, render interpolation.
Numeric gate: max single-tick angular-velocity jump ("pop" metric) per regime.

### Numbers (headless, PASS)

| regime | max velocity jump (deg/tick) | notes |
|---|---|---|
| Idle (breathing + verlet only, 5 s) | 0.0014 | sign-flip rate 0.0067 — smooth sine, no frame-frequency vibration |
| Normal crossfade ×3 | 0.308 | clean eased transition |
| Stress retarget (interrupt at 300 ms) ×3 | 0.321 | **1.04× normal** (threshold < 2×) |

**Negative control:** the same stress on a fixed-duration smoothstep lerp popped at
**13.85× normal** (2.476 deg/tick). The carried velocity is what kills the pop —
quantitatively, not aesthetically.

### The composition order (normative — written into ENGINE_V2.md P3/P5)

Per fixed sim tick (120 Hz), in exactly this order:

1. **Base-pose blend** — per joint, drive a persistent base local angle toward the
   target pose with **angle-aware critically-damped SmoothDamp** carrying a per-joint
   velocity that is *never reset*. A crossfade is nothing but a change of target;
   interrupts continue from current position *and velocity* (this is the no-pop
   mechanism). Shortest-arc via `wrapPi(a) = atan2(sin a, cos a)`; `smoothTime ≈
   durationSec × 0.6`. Root offset uses the linear SmoothDamp variant.
2. **Additive procedural** — deltas (breathing sine etc.) added into a **throwaway
   per-tick buffer, never written back into blend state** (feeding the integrator makes
   the oscillation accumulate and drift the base pose). Angular additives enter pre-FK;
   positional bob enters after the base root offset.
3. **FK solve of the post-additive pose** → world-space bone origins/ends.
4. **Verlet secondary** — particle targets track the **post-additive FK** (targeting the
   pre-additive pose strips the breathing from the follow-through and reads dead), then
   a hard length constraint to the FK anchor converts positional lag into *angular*
   lag/overshoot/settle (follow-through, not stretch).
5. **Render interpolation last** (rAF, not sim): lerp the two most recent sim snapshots'
   rendered geometry by the accumulator alpha. Sim state and verlet history are never
   interpolated.

### Tuning values that worked

- Breathing 0.4 Hz; chest +0.030 rad, neck −0.018, shoulders ±0.024; root bob 1.2 px.
- Character-secondary verlet: stiffness 0.28, damping 0.86, 2 iterations per tick.
- Crossfades 650–700 ms; the critically-damped response *is* the ease.

### Failures worth remembering

- Fixed-duration eased lerp: position-continuous but velocity-zeroing on retarget → 13.85× pop.
- Additive fed back into blend state → drift.
- Verlet chasing the pre-additive pose → lifeless secondary.
- Hip joints must branch from the pelvis *origin*, not its end.
