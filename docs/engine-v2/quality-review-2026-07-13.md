# Engine v2 post-recovery quality review

**Reviewed:** 2026-07-13

**Compared:** recovery branch replacement at `/` and legacy at `/legacy`

**Scope:** perceived smoothness, pacing, character cohesion, cape behavior, walk quality, camera, effects, interaction feedback, performance evidence, and acceptance status

## Verdict

The recovery work fixed the fundamental parity problem. Engine v2 now has the right bones: recognizable authored poses, distinct traversal performances, arrivals, interaction recovery, back-navigation spectacle, and a viable data-driven rendering path.

The remaining gap is not “add more animation.” It is that several animation systems currently control adjacent pieces of the same visible performance without sharing a clock, phase, anchor, or transition policy.

The most important conflicts are:

1. engine locomotion moves and bobs the hidden rig;
2. the expressive skin runs its own CSS walk and internal acting;
3. the cape follows the hidden rig rather than the visible skin;
4. the camera receives stepped React updates and eases toward each one for much longer than the update interval;
5. the fixed-step simulation is rendered without interpolation.

That combination explains the observed slow walk, high-frequency jitter, cape detachment, floaty camera, and rough pose changes. These are fixable without discarding the engine or the expressive-skin strategy. The next pass should consolidate motion authority before any more pose-by-pose tuning.

## What improved materially

Compared with the previous review:

- The replacement now uses expressive drawings rather than exposing the generic rig for most signature poses.
- Fight, Spray, landings, poof travel, and persistent arrivals are recognizable performances.
- Page flow and back-navigation have real staging again.
- Poke and drag recovery have authored responses rather than simple snap-back behavior.
- The prior duplicate one-shot behavior registration failure has been addressed.
- The shell, content, and actor now feel like one product rather than a renderer demo embedded in the notebook.

This is significant progress. The quality problems below are refinement problems with identifiable causes, not evidence that the world-model approach failed.

## Live review observations

I replayed the routes side by side through Intro, About, Work, Skills, Contact, same-page travel, poke, and backward navigation. Random route selection was not treated as a timing comparison unless the same performance could be identified. The recurring black regions in legacy browser captures were excluded; they remain a route-specific browser compositing/capture artifact and do not represent missing legacy content.

### Character cohesion

- At rest, the replacement silhouette is much closer to legacy than before.
- The replacement cape is consistently larger and heavier-looking. In several settled poses it reads as a kite attached behind Dash rather than a tied bandana/cape.
- During Fight, walking, poof, poke, and page travel, the cape knot and the drawn shoulder/neck do not remain visually married.
- The cape sometimes folds over itself into separate pink and gray-looking facets. Its opacity and self-intersection make it look like multiple pieces.
- Pose changes can switch the entire authored body drawing immediately while the cape retains velocity from the prior state.

### Walk and general movement

- The replacement walk is materially slower than legacy in ordinary use.
- The body has a high-frequency vertical tremor underneath the slower authored walk drawing.
- The walk cycle does not read as causally connected to distance traveled. Feet and body motion feel like an animation playing while the character is translated.
- Arrival changes the walk into the landing pose abruptly; the last gait bob and the landing do not consistently form one clean contact beat.
- The camera's continuing chase makes Dash's screen-space motion feel less decisive even when world-space progress is monotonic.

### Camera and flow

- Travel often begins with the camera moving before the important silhouette is legible.
- The actor and destination can drift while the camera catches up, producing a floaty or delayed sensation.
- In quick actions, the camera can still be easing after the action has changed beats.
- Static page framing is strong; the weakness is specifically the continuous follow path.

### Acting, effects, and feedback

- Signature poses now carry much more of the legacy personality.
- Whole-figure poke arcs are energetic, but the body/cape relationship can break most visibly at the extremes.
- Engine speech bubbles do not match the legacy feedback language. The engine uses a white SVG rectangle, Patrick Hand, lowercase text, and no pop/rotation; legacy uses the yellow marker bubble, Permanent Marker, and a pop-in. The same quip therefore feels less emphatic in the replacement.
- Skin changes use immediate `display` swaps. Some of the legacy cuts were also immediate, but its pose art and CSS choreography were designed around those cuts. The new cape and physical root continue across them, exposing the seam.

## Root-cause diagnosis

### P0 — two gait systems are visible at once

The engine's default ground locomotion is a procedural gait. It advances the root, computes a gait cadence, and adds a vertical bounce in `packages/engine/src/gait.ts`. The renderer then places the expressive walk skin at the physical capsule/root while the skin runs the extracted legacy `bobw`, arm, leg, and head CSS animations.

Those systems are not phase-locked.

For Dash's current settings:

- default engine walk speed is `90 × (0.6 + 0.8 × 0.8) = 111.6 px/s`;
- the 37 px leg and `0.9 × leg length` stride cap yield a maximum stride of about 33.3 px;
- the procedural gait therefore runs at about `111.6 / 33.3 = 3.35 cycles/s`;
- its absolute-sine root bounce peaks about 6.7 times per second;
- the visible legacy walk skin runs on a fixed 0.8 s CSS cycle, or 1.25 cycles/s, with its own bob.

The visible skin is therefore translated by a procedural bounce whose rhythm is unrelated to the body drawing's walk rhythm. The hidden rig also drives the cape socket at the procedural gait frequency. This is the primary source of the walk's jitter and the cape's nervous movement.

Relevant code:

- `packages/engine/src/locomotion.ts:55,343`
- `packages/engine/src/gait.ts:115-143,231-238`
- `content/engine/skins/keyframes.json:145-179`
- `src/notebook/engine/EngineLayer.tsx:183-200`

### P0 — the walk and approach speeds are not at legacy pace

`builtin:walk` does not author a speed, so it inherits 111.6 px/s.

Legacy ordinary walk uses `distance / 190`, bounded to 0.7–2.2 seconds. Signature approaches use approximately 260–290 px/s, while the smash exit uses about 220 px/s. The replacement's leading `moveTo` steps in vault, rope, wallrun, slide, smash, and combo also omit speed and inherit 111.6 px/s.

This is not a subtle easing difference. Ordinary long walks are roughly 41% slower than the legacy 190 px/s baseline, and signature approaches can be less than half legacy speed. It explains both the user's “slow” description and why multi-beat performances feel as though they take too long to get started.

Relevant code:

- `content/engine/behaviors/builtin/walk.json:5-8`
- `content/engine/behaviors/builtin/*.json` leading `moveTo` steps
- `src/notebook/Notebook.tsx:568-580,591-599,636-646,659-669,681-689,723-737`

Increasing speed without first resolving the dual-gait problem would increase procedural cadence further and make the visual jitter worse.

### P0 — the cape is attached to an invisible character

The expressive skin replaces the rendered rig, but the cape remains a Verlet ribbon anchored to the hidden rig's `neck` joint. Internal skin animations—Fight body shifts, walk bob, head motion, pose-specific deformation—do not move that hidden joint in the same way.

The cape can therefore be physically attached to the rig while visually detached from the drawing.

The current default cape is also large:

- 3 segments × 13.5 px = 40.5 px centerline length;
- the tip half-width is 11.5 px, producing a roughly 23 px-wide end;
- the rest spring is deliberately soft (`0.028`), so old velocity is visible;
- the same chain survives pose/source changes and continues reacting to the prior motion.

The “one Verlet cape” entry in the known-difference register is no longer accepted: the owner's current live feedback explicitly rejects its attachment and flight quality.

Relevant code:

- `packages/engine/src/accessory.ts:53-76,86-130`
- `packages/renderer-svg/src/character.ts:340-346,529-545,673-676`
- `src/notebook/engine/EngineLayer.tsx:183-200`

### P1 — fixed-step state is rendered without interpolation

`EngineLayer` advances the 120 Hz simulation in a loop and renders the latest solved state. It does not interpolate the previous and current visual transforms using the remaining accumulator fraction.

On a display whose refresh phase is not perfectly aligned with the simulation, frames can alternate between no simulation advance, one step, or more than one step. The simulation remains deterministic and correct, but screen-space velocity acquires small repeats and jumps. Legacy CSS animation samples continuous document time, so this difference is visible as micro-stutter even when no frames are technically dropped.

Relevant code: `src/notebook/engine/EngineLayer.tsx:147-168`.

### P1 — the camera is a slow transition chasing stepped targets

During travel, `EngineLayer` sends a new camera target every nine simulation ticks—about every 75 ms. `Notebook` applies a 0.9 s CSS transition for normal camera motion or 0.45 s for “fast” motion.

Each target update restarts a transition whose duration is 6–12 times longer than the update interval. This is a low-pass chase, not an authored camera move. It creates lag and makes the actor's motion feel slower and less grounded.

Relevant code:

- `src/notebook/engine/EngineLayer.tsx:202-207`
- `src/notebook/Notebook.tsx:1064-1072,1126,1169,1200`

### P1 — skin animation time is outside the engine timeline

Skin keyframes are converted into CSS `animation` shorthands. Their phase advances in browser wall-clock time, independently of engine simulation time, locomotion distance, pause/restore, and review replay. Hiding and re-showing a skin restarts its animation at zero.

This is acceptable for a decorative idle loop, but not for locomotion, impact, or any animation whose contact beats must line up with world state.

Relevant code: `packages/renderer-svg/src/character.ts:355-385,426-464`.

### P1 — speech feedback lost the site's visual language

The engine bubble duplicates the concept rather than using the shared legacy `ReactBubble`. It loses the yellow fill, marker font, rotated shape, and pop timing. Text width is estimated from character count rather than measured, which can also produce awkward padding for narrow or wide glyphs.

Relevant code:

- `src/notebook/engine/EngineLayer.tsx:1248-1295`
- `src/notebook/effects/ReactBubble.tsx`

### P1 — the current charm evidence does not exercise the reported failures

The Stage 5 charm script captures settled still images for idle, Fight, Work, and Spray. It does not capture walking, cape anchor error over time, pose transitions, camera velocity, or a full interaction loop. Its commit contains the capture script, not an owner approval artifact.

The current `parity-results.md` language therefore overstates closure. Static crops demonstrate drawing coverage; they cannot establish motion quality.

Relevant code: `packages/renderer-svg/dev/shoot-charm-s5.mjs:1-75`.

### P2 — frame-delivery measurements are not smoothness measurements

The integrated performance script measures rAF timestamp deltas and heap change. The reported 8.3 ms average mainly establishes that the test browser is presenting at approximately 120 Hz and that the scenario did not miss deadlines.

It does not measure:

- actor screen-space velocity consistency;
- repeated fixed-step poses;
- camera lag or jerk;
- gait/skin phase error;
- cape socket separation;
- foot contact drift;
- input-to-visible-response latency;
- long tasks or per-frame main-thread work.

The engine does not appear computationally slow in this review. “Slow” is predominantly choreography and camera pacing; “not smooth” is predominantly phase, interpolation, and attachment quality. The existing performance data does not contradict that conclusion.

Relevant code: `scripts/perf-compare.mjs:21-26,41-50,56-71`.

## Acceptance status

The following gates should be considered open again:

| Gate | Status | Reason |
|---|---|---|
| Walk timing | Open | Default 111.6 px/s does not match legacy's authored speed classes. |
| Walk motion | Open | Procedural gait and CSS walk are not phase-locked. |
| Cape charm | Rejected by owner | Current live feedback identifies detachment and excessive flight. |
| Camera smoothness | Open | Follow camera chases 75 ms target updates with 450–900 ms transitions. |
| Interaction feedback | Open | Poke motion exists, but bubble and cape quality remain below legacy. |
| Integrated smoothness | Open | Current perf script measures frame delivery, not motion continuity. |
| Static expressive-skin coverage | Pass | The signature drawings are present and recognizable. |
| Core engine correctness | Pass | No new wedge or correctness failure was found in this review. |

The replacement should remain the development default, but Phase 9/charm acceptance should not be recorded as complete yet.

## Feasibility

Parity remains feasible.

No rewrite is required. The engine should continue to own world position, collision, routing, behavior, and deterministic event time. The expressive skin should remain. What must change is the contract between simulation and presentation:

- one authoritative motion phase for visible locomotion;
- one visible attachment/socket model for the cape;
- interpolated presentation state;
- one camera integrator or authored camera timeline;
- shared site components for feedback styling.

Once those boundaries are explicit, the remaining work becomes bounded tuning instead of competing animation systems.

## Recommended immediate decision

For skinned characters, choose the expressive skin as the authority for internal body motion and use the engine for path progress, support, collision, and events. Do not let a hidden procedural gait add a second visible bob or drive visible accessories at an unrelated phase.

For the cape, use pose/skin-authored attachment points and rest silhouettes, with physics constrained to a small secondary deformation. A full free ribbon should not replace the authored cape shape.

The detailed execution order and gates are in `quality-plan.md`.
