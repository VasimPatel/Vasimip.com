# Engine v2 parity recovery plan

This plan supplements `docs/ENGINE_V2.md`. It does not authorize additions to the closed verb/component sets. Where the recommended rendering strategy or cue model widens a schema contract, obtain explicit owner sign-off before implementation.

## Outcome

Ship engine v2 as the default only when it is equal or better than legacy in flow, responsiveness, performance, authored staging, and charm. Keep `/legacy` as the canonical reference until the final owner checkpoint.

The plan is ordered to prevent another round of broad improvements that pass technical gates but leave the site less delightful.

## Decision 1: choose the visual parity target

Make this decision before bulk pose or behavior work.

### Recommended: expressive data skin over the engine rig

Engine v2 remains authoritative for joints, world position, collision, traversal, behavior, and secondary physics. A render-layer document may additionally supply pose/clip-specific ink geometry or deformations derived from the legacy SVG art.

Candidate shape:

- a character skin registry containing named path groups;
- pose data selecting or deforming those groups;
- clip tracks for group transforms, opacity, and path/morph keys;
- attachment points that still follow rig joints;
- face, props, and bandana kept in the same authored performance context.

This retains data-total authoring, preserves the engine architecture, and gives the renderer enough vocabulary to reproduce hand-drawn silhouettes.

### Alternative: rig-only experiential parity

Keep the current circle-head/polyline topology and aim for equal charm rather than the same drawings. This requires substantially more joint clips, pose-specific face/prop tracks, and owner tuning. It can succeed experientially, but exact visual parity should not be promised.

### Rejected: continue static pose extraction plus generic locomotion

The review already demonstrates the ceiling of this path. It preserves IDs and rough silhouettes while discarding the performance.

## Stage 0: stop-the-line correctness

Land a small PR before any charm work.

- Fix dynamic one-shot behavior identity so repeated chat, poke, and drop lines never collide in the registry.
- Add a test that runs at least two different chat lines, poke lines, and drop lines in one runtime.
- Make the site smoke test wait through two fidget windows and fail on any page error or console error.
- Make the migration loss report a checked artifact; fail if a new unapproved loss appears.
- Keep `/legacy` and the replacement route available side by side.

**Gate:** ten minutes of forced fidget/poke/drop activity, zero exceptions, zero wedged busy state, and all engine gates green.

## Stage 1: build the parity laboratory

Replace the current ad-hoc screenshot scripts with one portable comparison harness.

### Controls

- Force the same named behavior in both routes rather than relying on random pools.
- Expose a review-only seeded choice source for adapter randomness.
- Expose named checkpoints: start, anticipation, launch, apex, contact, recovery, idle.
- Record engine events and legacy state transitions on one normalized timeline.
- Capture both full scene and Dash close-up at the same viewport and timestamps.
- Write output under a caller-provided path, never a machine-specific scratch directory.

### Required strips

- idle far/near cursor for at least 10 seconds;
- all 24 poses at rest;
- walk cycle in both directions;
- all 11 built-in travels;
- tightrope and `action2`;
- every authored arrival;
- poke hop/spin/wob;
- drag, held drag, release, and landing;
- forward page turn;
- bomb reverse and poof reverse;
- Skills reveal and Contact cheer;
- autoplay through the complete notebook.

### Evidence per scenario

- side-by-side frame strip;
- duration and checkpoint timestamps;
- camera center/scale curve;
- character root path;
- active pose/clip and speech text;
- visual-effect and audio events;
- console errors;
- reviewer notes.

Include a negative control: intentionally remove one landing squash or camera beat and prove the visual gate notices.

**Gate:** the harness deterministically reproduces known gaps from the review and gives the same result on two consecutive runs.

## Stage 2: prove one complete signature slice

Do not port everything yet. Implement one slice that exercises the missing system contracts:

1. About entrance stroll;
2. persistent Fight arrival, including internal sword acting, face, prop, and bandana;
3. a same-page Vault travel with run-up, optional beat, dedicated pose/clip, camera composition, landing impact, and recovery;
4. one poke and one drag/drop;
5. bomb reverse navigation with bomb, hole, page turn, re-entry, and recovery.

This slice forces decisions about concurrent acting, camera cues, effect cues, timing, skin fidelity, interruptibility, and page-shell coordination.

### Runtime work required by the slice

- Execute milestone `strikePose` and `playClip` cues through a real concurrent performance layer.
- Preserve prop and face context while a clip is active.
- Wire `intent:camera` to notebook camera targets and timing.
- Give effect intents a visible site adapter rather than mapping them only to sound.
- Define interruption rules: poke does not cancel travel; real drag does; navigation supersedes safely; arrival starts once after recovery.
- Make behavior completion wait for the authored recovery beat, not merely root arrival.

**Gate:** owner approves the live side-by-side slice as equally charming. Numeric and screenshot gates are necessary but cannot substitute for this checkpoint.

If the slice cannot match charm with the selected visual strategy, stop and revisit Decision 1. Do not compensate by porting more content.

## Stage 3: restore the performance grammar

Port the legacy built-ins one at a time using reusable performance primitives, without flattening them into a single universal arc.

| Behavior | Beats that must survive |
|---|---|
| walk | cadence, bob, arm/leg asymmetry, possible trip, recovery |
| hop | held anticipation, jump arc, optional hang, pull-up/drop, landing settle |
| roll | tuck silhouette, continuous spin, travel arc, landing |
| poof | origin smoke, disappearance, destination smoke, reappearance, landing |
| vault | edge run-up, optional peek, vault pose/arc, focused camera, impact |
| rope | edge approach, deliberate rope pose crossing, framed camera, landing |
| swing | anticipation, jump to bar, hanging swing, release, impact |
| wallrun | approach, wall-oriented climb, kick/release, landing |
| slide | approach, vertical/down-edge slide, scrape, release, landing |
| smash | approach, punch, crack, shake, continuation through target |
| combo | wallrun, rope traversal, release, jump, landing as one coherent routine |

For each behavior:

- author the visible sequence as data;
- preserve distance-dependent timing where it helps legibility;
- use the world model for feasibility and collision;
- use authored clips/camera/effects for performance;
- define blocked and interrupted versions;
- compare full-scene timing, not just a Dash crop;
- commit after its parity strip and owner review.

**Gate per behavior:** no generic fallback is visible in its normal feasible case; its silhouette and timing are unambiguously different from the other ten verbs.

## Stage 4: restore arrival and authored-content semantics

Eliminate every current migration loss or obtain an explicit owner waiver for it.

- Restore `face` as an authored arrival choice rather than approach-only direction.
- Restore `flourish` semantics.
- Represent persistent-until-next-transition poses directly; do not approximate them with a 12-second timer.
- Preserve speech hold duration.
- Preserve movement speed/easing where authored content depends on it, or translate it to named motion profiles with documented equivalence.
- Preserve tightrope camera scale/tempo and acting pose during travel.
- Restore geometric `when` gates using world queries or an approved gate extension.
- Convert page shove/crack/smoke/hole effects into visible, synchronized events.
- Verify Skills one-shot reveal and Contact one-shot cheer across page revisits and doc hot-swaps.

**Gate:** migration report has zero unapproved losses; every generated arrival/action passes its reference strip.

## Stage 5: character charm pass

Tune in this order so later work does not hide foundational problems.

1. **Silhouette and proportions:** head placement, torso line, limb hierarchy, hands/feet, far-limb depth, bandana mass.
2. **Pose-specific drawing:** brows, mouth, head shape, prop grip, line weight, intentional asymmetry.
3. **Timing:** anticipation holds, fast actions, impact freezes, overshoot, recovery.
4. **Internal overlap:** sword arm vs body, trailing limb vs root, face vs pose, bandana vs velocity.
5. **Idle restraint:** breathing and weight shift should be detectable but not noisy.
6. **Expression:** eyes track quickly; head follows with restraint; brows/mouth respond to the dramatic beat rather than every physical event.
7. **Variation:** surprise comes from authored alternates, not uncontrolled random mixing.

Do not judge this stage from a pose grid alone. Review 5–10 second live loops and full-scene compositions.

**Gate:** owner accepts idle, Fight, Spray, jump, landing, and one prop-free pose in motion and at rest.

## Stage 6: interaction and flow pass

- Poke: preserve all three readable arcs, quip duration, interruption gates, sound, and recovery.
- Drag: use pointer events; retain physics trail; add an authored release arc, landing pose, settle, and timed quip.
- Camera: keep Dash visible during travel and avoid centering the destination before the actor enters the shot unless the gag calls for it.
- Page turn: coordinate character exit/entry and page motion on one timeline.
- Back navigation: ship both full bomb and poof versions.
- Autoplay: wait for the full performance to complete plus an intentional reading dwell; do not advance on root arrival alone.
- Sound: every audible effect must have the intended visible partner; audio stays input-unlocked and interrupt-safe.

**Gate:** a complete manual read-through never feels rushed, never loses Dash outside the framed action, and never accepts an input that causes a stale callback or double arrival.

## Stage 7: integrated performance, responsive, and accessibility pass

Measure the actual two routes, not only the synthetic engine playground.

- Record frame-time average, p95, p99, long frames, sim time, SVG-write time, React commit time, memory growth, and input latency.
- Run desktop at 1440 × 900 and 1280 × 720, tablet at 768 × 1024, and mobile at 390 × 844.
- Repeat at 4× CPU throttle.
- Profile camera-follow React commits if the replacement misses budget.
- Add semantic buttons, keyboard focus, accessible labels/state, and pointer-event input.
- Add a reduced-motion mode that preserves story beats with fades/short translations rather than removing the story.
- Verify touch drag and tap-vs-drag discrimination.

**Gate:** thresholds in `parity-acceptance.md` pass with zero console errors and no unapproved bundle regression.

## Stage 8: final owner checkpoint and cutover

Run the complete acceptance matrix from a clean production build. Present:

- the live routes side by side;
- all deterministic strips;
- the migration-loss report;
- integrated performance results;
- accessibility/input results;
- the known-difference register.

Only the owner can approve intentional differences as equal-or-better. After approval:

1. keep `/legacy` for one release as a rollback/reference route;
2. monitor client errors and interaction completion;
3. retire legacy code only in a separate PR after the observation window.

## Suggested PR sequence

1. Runtime-error fixes and long-idle smoke gate.
2. Deterministic parity harness.
3. Owner decision and minimal schema/render contract for expressive skin or rig-only target.
4. Concurrent performance cues + camera/effect wiring.
5. Signature vertical slice.
6. One PR per builtin family: ground, airborne, prop/world, reverse navigation.
7. Arrivals/actions and zero-loss migration.
8. Character charm checkpoint.
9. Interaction/flow checkpoint.
10. Integrated performance, responsive, accessibility.
11. Final acceptance and guarded cutover.

Commit each independently reviewable behavior with its visual evidence and gates, as required by the repository instructions.
