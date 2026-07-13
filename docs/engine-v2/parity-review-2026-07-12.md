# Engine v2 parity review

**Reviewed:** 2026-07-12

**Compared:** replacement at `/` and legacy at `/legacy`
**Scope:** experience, flow, motion, charm, interaction, correctness, architecture, performance evidence, responsiveness, and accessibility

## Verdict

Parity is achievable, but the current replacement is not on a tuning-only path to it.

The world model, fixed-step runtime, SVG renderer, data registries, and retained legacy route are a sound foundation. The main gap is that the migration has reduced authored performances into generic locomotion plus static poses. Several mechanisms that the new behavior documents depend on are not connected to the visible site. More polish on the generic gait or face will not recover the missing staging.

There are two materially different targets:

- **Experiential parity**—the new engine may draw Dash differently, but the site is equally legible, funny, responsive, surprising, and authored. This is feasible with the existing rig plus richer clips, correct cue execution, and a full content pass.
- **Bespoke visual parity**—the characteristic silhouette and drawing decisions of every legacy pose survive. This is not feasible with the current circle-head/polyline renderer alone. It needs an owner-approved expressive-skin or pose-deformation data layer, or it needs to retain legacy pose art as a data-driven render skin over the new engine.

The recommended route is a hybrid: keep engine v2 as the authority for world state, traversal, collision, behaviors, determinism, and authoring, while allowing authored ink geometry to preserve the legacy's pose-specific drawing. This is compatible with the data-total goal if the geometry is data, not React component code.

Do not remove `/legacy`, bulk-polish all poses, or treat Phase 9 as accepted yet. First prove one complete vertical slice against an explicit parity gate.

## How this review was performed

I exercised both routes side by side through:

- cover open and the initial page turn;
- direct chapter navigation to Intro, About, Work, Skills, and Contact;
- same-page forward travel;
- backward page navigation;
- poke and drag/drop;
- entrance, arrival, idle, fidget, speech, camera, and page-effect states;
- the narrow layout visible in the in-app browser;
- console/runtime diagnostics;
- source tracing from the notebook shell through migration, behavior execution, locomotion, renderer, content documents, tests, and screenshot harnesses.

The primary desktop comparison viewport was 964 × 944 at device scale 2. The shell and content were the same v1 document in both routes. Random selection means individual legacy and replacement traversals were not always the same verb; this is itself a harness deficiency addressed in the plan.

### Comparison caveat

The legacy route intermittently painted large black regions after some animated transitions in this browser. The DOM content remained present, no console error accompanied it, and later navigation cleared it. Both modes share `PageRenderer`, so this is likely a separate 3D-transform/compositing issue or browser-specific capture defect. It should be reproduced in normal Chrome, but it is not counted as evidence that the replacement is better.

## Experience scorecard

| Dimension | Current result | Assessment |
|---|---|---|
| Notebook shell and content | Near parity | Same cover, pages, focus ring, HUD, copy, panels, and page-turn system are shared. |
| Basic navigation flow | Partial | Destinations work, but replacement travel and reverse navigation often resolve much sooner and with fewer beats. |
| Character recognition at rest | Partial | Dash is recognizable and the face/bandana are improved, but the figure reads more constructed and less drawn. |
| Locomotion identity | Poor | Distinct legacy verbs are commonly rendered as generic walk or jump paths. |
| Signature acting | Poor | Static pose extraction preserves rough silhouette, not internal acting, prop choreography, or per-pose easing. |
| Camera choreography | Poor to partial | The camera follows engine coordinates, but authored camera intents and legacy shot composition are not equivalent. |
| Effects and impacts | Poor | Smoke, holes, cracks, bombs, page shoves, and shakes are incomplete or abbreviated in engine-owned routines. |
| Poke | Partial | The legacy whole-body arcs were reused, but the replacement reaction has different face/body emphasis and less reliable speech. |
| Drag/drop | Poor to partial | Physics follow-through exists, but release snaps vertically to a support instead of performing the legacy recovery arc and landing beat. |
| Idle life | Partial and currently faulty | Breathing, blink, look, secondary motion, and fidgets exist; repeated chat can throw a runtime error. |
| Sound | Partial | Sound intents are bridged, but some visual events are approximated as sounds, so audio can announce an effect that is not seen. |
| Performance evidence | Inconclusive | Isolated engine budgets look healthy; the real integrated site has not been measured against the legacy route. |
| Accessibility and input | Poor in both | HUD controls are clickable spans without button semantics; mouse events dominate; reduced-motion support is absent. |

## What feels different in practice

### 1. The replacement gets to the answer before it performs the joke

On chapter entrances, engine Dash frequently reached or acted at the first panel while legacy Dash was still strolling in. In the About comparison, the replacement was already inside the hero panel around the first half-second observation while legacy Dash was visibly entering from the left. The same pattern appeared on Work and Contact.

On same-page About travel:

- early in the trip, the replacement camera was already centered on the destination while Dash was partly outside the shot;
- by the next observation, replacement Dash had settled into a generic stand;
- legacy Dash was still in a readable roll/tuck performance and later added a page interaction flourish.

This is not simply “legacy is slower.” Legacy time is divided into anticipation, action, impact, reaction, and recovery. Replacement time is predominantly transport.

### 2. Eleven named verbs do not currently produce eleven visible performances

The legacy routines in `Notebook.tsx` are multi-stage compositions:

- `vaultTo` runs to an edge, may peek, vaults with a dedicated camera frame, lands, shakes, and settles;
- `ropeTo` runs to an edge, crosses slowly in a rope pose with a camera hold, lands, and settles;
- `swingTo` anticipates, jumps to a bar, swings, releases, lands, and shakes;
- `wallrunTo`, `slideTo`, `smashTo`, and `comboTo` each have different paths, camera positions, poses, sounds, and effects;
- `bombBack` lasts roughly 4.2 seconds and includes throw, bomb arc, explosion, hole, dive, page turn, pop-in, and recovery;
- `poofBack` lasts roughly 2.1 seconds and stages smoke on both sides of the page turn.

The replacement behavior documents are much thinner. Examples:

- hop, roll, vault, swing, and smash are chiefly `jumpTo` plus different milestone cues;
- rope and slide are a static pose hold followed by `moveTo`;
- wallrun is `moveTo` plus a sound on arrival;
- combo is a short pose followed by `jumpTo`;
- replacement back navigation is a short pose/sound beat and then the page flip.

The names survived migration. The performances did not.

### 3. The documents request visible cues that the runtime only traces

This is the most important code-level cause of the gap.

`packages/engine/src/behavior.ts` accepts milestone cues for `strikePose` and `playClip`, but its cue executor only emits `cue:strikePose` or `cue:playClip`. It does not apply those sources to the visible blend tree. The builtin JSON relies on those cues for vault, roll, swing, combo, and smash acting.

Likewise, camera cues emit trace events, but `EngineLayer` does not subscribe to `intent:camera`. The site instead uses a generic throttled character-follow camera. As a result, authored shot design has no visual authority.

The schema and tests can therefore report a valid behavior and correct event trace while the user sees a generic traversal.

### 4. Static pose parity is being mistaken for performance parity

The current renderer supports:

- continuous polylines for limbs;
- one circular head construction;
- a small closed set of brow and mouth states;
- pose-scoped props anchored to a joint;
- one physics-driven bandana ribbon;
- whole-figure squash, spin, lean, and a few reused CSS arcs.

The legacy poses contain pose-specific drawing and motion. `Fight.tsx`, for example, animates the back arm, sword arm, forearm/sword, body shift, face, and bandana with separate easing. The v2 fight data is one static joint-angle pose plus a sword prop, with only a whole-body `fightshift` wrapper. The renderer cannot currently express the legacy's internal sword choreography.

This is why side-by-side static silhouettes can pass while the live result feels rigid.

### 5. Migration is explicitly lossy

The current document produces 15 migration notes. The losses include:

- the tightrope geometric gate;
- authored movement speed and easing;
- authored camera zoom/tempo;
- speech hold duration;
- acting pose during a move;
- arrival facing;
- arrival flourish;
- persistent arrival-pose semantics;
- page effects approximated as sound intents.

There are no missing pose or behavior IDs, which can look reassuring, but coverage by ID is not semantic parity.

### 6. Idle chatter has a replacement-only correctness failure

The replacement threw:

> behavior id `__fidget:chat` is already registered with a different doc

The first randomized chatter behavior registers a newly allocated document under a stable ID. A later chatter line allocates another document under the same ID, violating the behavior registry identity contract. Poke and drop quips use the same pattern with stable IDs and variable text, so they carry the same latent failure if invoked repeatedly with different lines.

The failure is not caught by the current engine tests or screenshot harness. A charming idle system that eventually throws is not parity.

### 7. Drag/drop retained physics but lost staging

The new drag follows the pointer with eased root motion and lets secondary joints/bandana trail. That is a good engine-native improvement.

On release, however, it probes straight down and snaps onto the first support, emits a landing event, and may speak. The legacy release chooses the nearest panel, animates a 550 ms return arc, shows tuck then land, waits for the settle, and only then delivers a quip. The replacement is physically motivated but theatrically under-authored.

### 8. Backward navigation is the clearest parity failure

The legacy reverse path is a signature feature, not navigation decoration. The replacement `backNav` comment calls itself a spectacle, but the implementation is a short pose and sound. During review, replacement navigation had already changed pages while the legacy bomb was still in flight.

This should become a north-star parity slice because it exercises behavior timing, props, effects, camera, page mutation, page turn, and recovery in one sequence.

### 9. Randomness prevents fair review

Both the legacy shell and parts of `EngineLayer` use `Math.random()` for travel choice, fidgets, pokes, drops, entrance flourishes, and back-navigation mode. The engine core is deterministic, but the user-facing adapter is not.

The existing parity screenshot script runs the same journey in separate sessions without forcing the same choices. It covers idle, hop, and poke only and writes to a hard-coded Claude scratch directory. It cannot establish whole-site parity.

## Performance diagnosis

No obvious frame collapse occurred during the desktop walkthrough. The core architecture is capable of meeting the target: one fixed-step simulation, direct SVG writes, a shared Verlet world, and no React character reconciliation per frame.

The present evidence is still insufficient:

- `behavior.perf.test.ts` measures two headless runtimes, not the integrated site;
- the renderer perf page measures a synthetic budget scene, not notebook camera, page stack, effects, speech, HUD, and character together;
- the production `EngineLayer` runs simulation at 120 Hz and renders every animation frame;
- camera follow calls React `setState` about every nine simulation ticks during travel, causing the Notebook and page tree to reconcile during motion;
- renderer hot paths create strings and small arrays every frame (`parts`, ribbon coordinate arrays, SVG path strings); this may be fine, but it is not “zero allocation” as stated in the plan;
- legacy and replacement bundle, frame-time, long-task, memory, and input-latency results have not been recorded side by side.

The likely outcome is that engine v2 can be at least as fast as legacy, but that claim is not yet demonstrated on the actual experience. Do not optimize speculatively; add integrated measurements and profile only failing paths.

## Responsiveness and accessibility

The shared camera-fit model keeps the notebook usable at narrow widths, but the experience becomes an aggressive crop around the active panel. The HUD can extend beyond the viewport, and touch interaction is not a first-class input path.

Both routes share these accessibility problems:

- HUD actions are `<span onClick>` elements, not buttons or links;
- there are no accessible names, focus states, or tab stops for those controls;
- the cover and Dash interaction surfaces are non-semantic divs;
- drag uses mouse events rather than pointer events;
- no `prefers-reduced-motion` mode exists despite constant and large motion;
- animation, sound, and autoplay state are not exposed semantically;
- the page content is all present in the DOM at once, so assistive reading order does not match the visual page state.

Accessibility is not a difference between routes, but “parity in anything relevant” should not preserve these defects. It belongs in the final acceptance gate after charm is restored.

## Is the architecture capable of parity?

### What is worth keeping

- The notebook shell is already shared, which sharply limits content/layout drift.
- Legacy remains available at `/legacy`, enabling real regression review.
- The fixed-step engine, behavior state, world geometry, collision, and traversal layers are testable and data-oriented.
- Pose, clip, character, and behavior documents provide a viable authoring substrate.
- Direct SVG rendering is appropriate for this visual style.
- The renderer already supports pose props, expressive face states, accessory physics, squash, and cursor response.
- The migration produces an explicit loss report instead of silently claiming fidelity.
- The repository has strong determinism and headless correctness coverage.

### What must change

- Milestone performance cues must affect the live blend/acting layers, not only the trace.
- Camera intents and visual effect intents must drive the site adapter.
- Behaviors need multi-beat authored staging, not aliases for generic move/jump.
- Clips need to retain face/prop/expressive-skin context while playing.
- Arrival timing, persistence, facing, flourish, and speech duration need exact semantics.
- Adapter-level randomness needs controllable seeds/forced choices for review and stable IDs for dynamic one-shots.
- The renderer needs an owner-approved way to carry pose-specific ink decisions if bespoke visual parity is required.
- The parity harness must cover the whole experience and fail on console errors.

## Final diagnosis

The engine did not make charm impossible. The migration treated charm-bearing information as incidental: local easing, internal pose animation, camera composition, effect choreography, timing, persistence, and drawing topology were either dropped, approximated, or left trace-only.

The route to parity is therefore not “improve physics” in the abstract. It is:

1. preserve authored performance as first-class data;
2. make every accepted performance cue visibly executable;
3. prove one signature sequence end to end;
4. port the legacy performance grammar deliberately;
5. measure the integrated experience;
6. let the owner judge live charm before bulk migration continues.
