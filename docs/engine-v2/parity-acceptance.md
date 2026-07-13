# Engine v2 parity acceptance contract

This document defines what “parity” means and how it is accepted. It exists to prevent correctness tests, pose grids, or one favorable screenshot from standing in for the complete experience.

## Acceptance rule

A scenario passes only when all applicable gates pass:

1. **Functional:** it reaches the correct state and never wedges.
2. **Temporal:** its anticipation, action, impact, recovery, and reading dwell are present and intentionally timed.
3. **Visual:** silhouettes, staging, effects, and camera communicate the same idea at a glance.
4. **Interaction:** input is responsive, interrupt rules are correct, and the result is satisfying.
5. **Performance:** the integrated experience stays within budget.
6. **Charm:** the owner judges the live replacement equal or better.

Automated gates may reject a build. They may not grant final charm approval.

## Parity dimensions

### Experience and flow

- The cover communicates how to start and opens on click/tap/keyboard.
- Page and panel order are identical unless a difference is explicitly approved.
- The camera keeps the active action legible.
- Autoplay advances only after the performance and a reading dwell.
- Reverse navigation feels like a feature, not a delayed button.
- No input is silently discarded except while a clearly uninterruptible beat is playing.

### Character and charm

- Dash is recognizable in every pose at thumbnail size.
- Each named travel verb has a distinct silhouette and rhythm.
- Anticipation, contact, overshoot, and recovery are readable.
- Eyes, brows, mouth, hands/feet, prop grip, and bandana support the action.
- Idle motion is alive but not noisy.
- Random variation does not create incoherent combinations.

### Content semantics

- Every arrival preserves pose, face, speech, sound, flags, persistence, flourish, and once-only behavior.
- Every custom action preserves its world gate, movement profile, camera, acting pose, speech duration, effects, and finish semantics.
- Migration has zero unapproved losses.

### Correctness

- Zero page or console errors during the full suite.
- Busy state always clears.
- Repeated fidgets, pokes, drops, navigation, and doc swaps do not collide behavior IDs or retain stale callbacks.
- Tap during travel does not interrupt; a real drag does.
- Superseding navigation cancels the old sequence exactly once.

### Performance

Measure production builds on the actual notebook route.

| Metric | Acceptance threshold |
|---|---|
| Visual frame rate | 60 fps target on reference desktop; no sustained interval below 55 fps |
| Frame time | p95 ≤ 16.7 ms; p99 ≤ 33.3 ms |
| Long frames | < 1% of frames over 50 ms during the scenario suite |
| Engine simulation | p95 ≤ 2 ms per rendered frame at 4× CPU throttle |
| SVG writes | p95 ≤ 2 ms per rendered frame at 4× CPU throttle |
| Input response | visible acknowledgement within 100 ms |
| Memory | no monotonic growth across 20 full autoplay loops |
| Bundle | production JS no more than the existing approved +15% budget, unless owner-approved with evidence |

Compare the same metrics with legacy. Passing an absolute threshold does not excuse a material regression against legacy without approval.

### Responsive and input

- 1440 × 900, 1280 × 720, 768 × 1024, and 390 × 844 all keep the active action and HUD usable.
- Tap, drag, keyboard navigation, autoplay, and sound work without hover.
- The HUD does not overflow the viewport or cover the critical action.
- Rotation/resize during idle and travel settles safely.

### Accessibility

- HUD and cover controls are semantic buttons or links with accessible names.
- All controls are keyboard reachable with visible focus.
- Active page, autoplay, and sound states are exposed.
- Reduced-motion mode preserves story/meaning with restrained transitions.
- Sound is not required to understand impacts or navigation.
- Assistive reading order reflects the active page rather than all hidden pages.

## Scenario matrix

Each row requires a deterministic legacy and replacement run, a full-scene strip, a Dash close-up strip when relevant, normalized timeline data, and console capture.

| ID | Scenario | Required checkpoints |
|---|---|---|
| C01 | Cover at rest | composition, prompt pulse, Pip, HUD, resize |
| C02 | Open cover | input acknowledgement, page turn, Intro entrance, arrival |
| N01 | Forward page turn | character/page coordination, settle, reading frame |
| N02 | Direct tab navigation | correct page, cancellation, entrance, arrival |
| N03 | Bomb reverse | throw, bomb arc, explosion, hole, dive, page turn, pop-in, land |
| N04 | Poof reverse | origin smoke, vanish, page turn, destination smoke, reappear, land |
| T01 | Walk | start, two gait contacts, optional trip forced on/off, land |
| T02 | Hop | anticipation, launch, apex, contact, squash, recovery |
| T03 | Hop with hang | launch, hang, quip, pull/release, landing |
| T04 | Roll | tuck, spin, midpoint, contact, settle |
| T05 | Poof travel | origin vanish, destination reveal, landing |
| T06 | Vault | run-up, optional peek forced on/off, vault, impact |
| T07 | Rope | edge approach, crossing, camera hold, impact |
| T08 | Swing | anticipation, bar contact, swing, release, landing |
| T09 | Wallrun | approach, climb, kick/release, landing |
| T10 | Slide | approach, scrape/slide, release, landing |
| T11 | Smash | approach, punch, crack, shake, continuation, landing |
| T12 | Combo | wallrun, rope, release, jump, landing |
| A01 | Tightrope action | gate, approach, target camera, quip hold, rope pose move, clear |
| A02 | Page-shove action | effect, speech duration, final pose |
| R01 | Intro arrivals | face, speech, once flags, cheer, flourish |
| R02 | About Fight | entrance, persistent pose, sword acting, interruption |
| R03 | Work Think | persistent pose and interruption |
| R04 | Skills Spray | can/mist, 2.1 s hold, flag reveal, revisit does not replay |
| R05 | Contact Cheer | sound, quip, 1.75 s hold, once flag |
| I01 | Cursor far/near | eyes, head, lean, dilation, return lag |
| I02 | Poke hop | hit response, quip, arc, settle |
| I03 | Poke spin | center/pivot, quip, settle |
| I04 | Poke wob | amplitude decay, quip, settle |
| I05 | Stationary press | counts as poke; does not cancel travel |
| I06 | Drag and hold | threshold, trailing limbs/bandana, speech, pointer capture |
| I07 | Drop on panel | authored arc, contact, squash, quip, nearest valid support |
| I08 | Drop into void | visible recovery, current-panel fallback, no teleport pop |
| F01 | Idle 30 seconds | breath, blink, weight shift, fidget mix, no error |
| F02 | Two chatter cycles | different lines, stable registry, bubble timing |
| U01 | Autoplay full book | all pages, complete performances, reading dwell, stop at end |
| U02 | Sound toggle | semantic state, no pre-unlock failure, visible equivalents |
| U03 | Resize/rotate | safe camera and HUD at all reference sizes |
| U04 | Reduced motion | same story/state, restrained animation, no vestibular sequence |

## Timing comparison

For each scenario, record these timestamps relative to input:

- acknowledgement;
- anticipation start/end;
- root motion start/end;
- launch/apex/contact when applicable;
- effect start/peak/end;
- arrival start/end;
- speech start/end;
- camera motion start/end;
- safe idle/busy-clear.

Default tolerance is the greater of ±100 ms or ±10% of the legacy interval. A larger difference may pass only when the owner approves it as an improvement. Matching total duration while losing internal beats is a failure.

## Visual review rubric

Score each item 1–5 for both routes while viewing the live loop and strip:

- silhouette readability;
- pose specificity;
- anticipation;
- weight and impact;
- easing and recovery;
- facial intent;
- prop/body coordination;
- bandana follow-through;
- camera composition;
- joke/readability timing;
- surprise without incoherence;
- desire to interact again.

Replacement passes a scenario when no category is below legacy by more than one point, the overall replacement total is at least the legacy total, and the owner approves the live result. Scores are discussion aids, not an override of owner judgment.

## Known-difference register

Every intentional difference must record:

- scenario ID;
- legacy behavior;
- replacement behavior;
- reason for the change;
- evidence that it is equal or better;
- owner approval date.

An undocumented difference is a parity defect.

## Release gate

The default route may be declared parity-ready only when:

- every scenario is green or owner-waived;
- the migration loss report has no unapproved entry;
- the complete run has zero errors;
- integrated performance passes at desktop and mobile widths;
- the owner approves the signature slice and the final full read-through;
- `/legacy` remains available for the first observation release.
