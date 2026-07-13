# Engine v2 motion-quality plan

This plan follows the 2026-07-13 post-recovery quality review. It does not reopen the world-model architecture or authorize new gameplay verbs. It focuses on presentation contracts, content tuning, and acceptance evidence.

## Outcome

Make engine v2 feel intentional at normal reading speed: fast enough to stay playful, smooth enough to disappear as machinery, and cohesive enough that Dash reads as one drawing rather than a body, cape, camera, and physics system moving near each other.

## Order of operations

Do not begin with global speed increases or cape constant tuning. First remove the conflicting motion authorities, then tune pace and shape against the legacy route.

## Q0 — reopen the charm checkpoint and instrument the failures

Update the review harness before changing motion.

Record at every animation frame:

- simulation tick and interpolation alpha;
- physical root position;
- rendered skin root position;
- actor screen-space position after camera transform;
- camera target and actual camera transform;
- active skin/source and animation phase;
- visible neck/cape socket;
- cape root and tip positions;
- planted foot positions and rendered foot contact points.

Add dynamic comparison scenarios for:

- ordinary walk at short, medium, and long distances;
- approach walk for vault, rope, slide, wallrun, and smash;
- walk-to-land transition;
- Fight loop for at least two complete cycles;
- poof and bomb page return;
- poke spin/hop/wob;
- drag, held drag, release, and landing;
- abrupt source change while the cape has velocity;
- 60 Hz, 90 Hz, 120 Hz, and a deliberately irregular rAF cadence.

Capture full-scene strips and Dash close-ups. Add a 0.25× playback artifact for owner review; still images remain useful for silhouettes but cannot close the motion gate.

**Gate:** the harness reproduces the user's walk jitter and cape separation, and a negative control detects injected root stepping or a displaced cape socket.

Commit independently.

## Q1 — establish one visible locomotion authority

### Recommended contract

For an active expressive skin:

- engine locomotion owns path progress, facing, support surface, collision, arrival, and behavioral events;
- skin data owns internal body movement—leg cycle, arm cycle, head cycle, and body bob;
- the rendered ground socket comes from the support surface, not the procedural gait's bouncing hip/capsule;
- a single normalized motion phase drives every internal skin keyframe that must contact the world;
- phase derives from traveled distance and an authored stride length, not independent wall-clock time.

For an unskinned/generic character, the procedural gait remains the visible authority and continues to use IK and foot planting.

### Implementation shape

Prefer a small render contract over conditional special cases:

```text
PresentationMotion {
  pathPosition
  supportY
  facing
  phase
  source
  discontinuityId
}
```

The engine may still compute its procedural pose for collision helpers or generic rendering, but a skinned renderer must not inherit that gait's vertical bounce while also applying the skin's bob.

Replace critical CSS wall-clock animations with data sampling at the provided phase, or use a controlled animation instance whose `currentTime` is set from that phase. Decorative idle noise may remain browser-timed if it has no world contact.

### Walk contact policy

- Author a stride distance for the legacy walk drawing.
- Advance phase by distance traveled / stride distance.
- Start on a readable contact pose.
- End on a contact pose before entering squash-land.
- Do not snap from an arbitrary mid-air leg frame into the landing.
- Reset or match phase after trip recovery.

**Gate:** slow-motion walk shows one coherent bob, stable ground contact, no phase drift over a long traverse, and the same result at 60/90/120 Hz.

Commit independently.

## Q2 — add render interpolation

Keep deterministic simulation at 120 Hz. Add a presentation snapshot on each simulation step and render between the previous and current snapshots using `alpha = accumulator / STEP_MS`.

Interpolate at minimum:

- path/root x and y;
- facing transitions where applicable;
- skin ground socket;
- camera follow input;
- cape particles or the final cape deformation points;
- scripted drag/back-navigation root motion if it remains outside the simulation.

Angles should use shortest-arc interpolation. Discontinuities such as poof teleport, page remount, bomb hole transition, and explicit source reset must increment `discontinuityId` and snap cleanly rather than interpolating across the page.

Do not interpolate behavior state, collision decisions, or event time; interpolation is presentation-only.

**Gate:** actor screen-space displacement has no alternating zero/double-step pattern at 60/90/120 Hz, while deterministic engine traces remain byte-identical.

Commit independently.

## Q3 — rebuild the cape as authored shape plus bounded secondary motion

The current free ribbon should not be the silhouette authority.

### Recommended cape model

Extend skin data with:

- a pose/skin-specific neck socket;
- an authored rest cape polygon or centerline;
- optional per-keyframe socket/shape transforms;
- a small physics weight and maximum deformation envelope;
- reset behavior for source change, teleport, and facing flip.

Render the authored cape silhouette first. Apply secondary motion to its trailing points only. Keep the knot/root exactly on the visible socket.

Suggested constraints:

- socket separation: ≤2 px at rest/walk, ≤4 px during extreme acting;
- no segment stretches beyond 105% of authored length;
- tip may not cross in front of the face/torso unless that pose explicitly allows it;
- normal idle/walk tip stays within the pose's authored envelope;
- source switch either transfers a compatible deformation or resets within one frame;
- teleport and page change always reset velocity;
- facing flip mirrors/restages the cape rather than dragging it through the body.

Start by restoring the legacy cape silhouettes for stand, walk, fight, spray, tuck, land, throw, and poof. These cover the failures most visible in the live review.

Only after the sockets and baseline silhouettes pass should damping, stiffness, gravity, and flutter be tuned. The existing `segments`, `segLen`, `REST_STIFF`, and width values are downstream parameters, not the root fix.

**Gate:** owner approves a live cape reel containing idle, walk, Fight, poke, drag, poof, landing, and a facing reversal.

Commit independently.

## Q4 — restore authored pace per performance

After Q1 is stable, author speeds in behavior data rather than changing the global locomotion default.

Starting targets from legacy:

| Segment | Legacy target |
|---|---:|
| Ordinary walk | 190 px/s, with 0.7–2.2 s bounds |
| Vault approach | about 270 px/s |
| Rope approach | about 270 px/s |
| Wallrun approach | about 290 px/s |
| Slide approach | about 290 px/s |
| Smash approach | about 260 px/s |
| Smash exit | about 220 px/s |
| Rope crossing | 115 px/s |
| Combo rope crossing | 130 px/s |

Use explicit `speed` on the relevant `moveTo` steps. If min/max duration behavior is required for ordinary walk, express it as a named site motion profile or adapter timing policy rather than altering generic world locomotion.

Recheck anticipation and recovery after speed changes. A fast approach needs enough anticipation to read, but should not acquire an extra pause just to make the total duration match.

**Gate:** every performance's root-motion interval is within the greater of ±100 ms or ±10% of legacy, as required by `parity-acceptance.md`, and owner review prefers the live rhythm.

Commit one performance family at a time.

## Q5 — replace the camera chase with one motion policy

Do not feed 75 ms target updates into 450–900 ms CSS transitions.

Choose one of these models:

### Recommended: authored shot per behavior beat

- Frame the departure and destination before root motion begins.
- Use the existing camera cues for midpoint/impact shots.
- Hold a stable composition through fast action.
- Release to the destination panel after landing.

This best matches the comic-panel staging of legacy and avoids unnecessary tracking.

### Alternative: continuous damped follow

If continuous follow is desired, run one rAF camera integrator from interpolated actor state. Use a critically damped response with an explicit maximum lag. Do not layer a CSS transition on top of the integrator.

In either model:

- Dash and the destination remain legible before the first action beat;
- the camera stops when the action stops;
- fast impacts do not occur while the camera is still traveling to a prior target;
- pointer parallax does not add visible noise during a choreographed move.

**Gate:** camera and actor screen-space velocity plots contain no target-update sawtooth, and the owner approves walk, vault, swing, smash, poof, and bomb-back at normal speed.

Commit independently.

## Q6 — polish transitions and feedback

### Skin/source changes

- Define match points for ground, head, and hands where adjacent poses need continuity.
- Restart one-shot skin animation at a deliberate authored frame.
- Preserve continuous phase only for true loops.
- Apply a very short opacity/shape blend only where it improves the cut; do not blur intentionally punchy pose changes.
- Coordinate cape reset/transfer with the source change.

### Speech bubbles

Use the shared `ReactBubble` visual language for engine speech:

- yellow fill;
- Permanent Marker;
- rotated hand-drawn shape;
- pop-in timing;
- shared padding and measured text width;
- consistent screen/page anchoring and collision with viewport edges.

The engine should publish speech state; the notebook shell should render the bubble. Avoid a second lookalike implementation inside the SVG renderer.

### Effects and interaction

- Recheck smoke, boom, hole, crack, and landing ring scale against Dash at every camera zoom.
- Verify poke arcs with the corrected cape.
- Verify drag while the camera is static and while it is settling.
- Complete the deferred pointer-event path so touch drag receives the same staged recovery.

**Gate:** interaction reel passes poke, repeated poke, short grab, drag, release, and back navigation without a visual seam or mismatched feedback component.

Commit by coherent interaction family.

## Q7 — replace the final quality evidence

Retain existing correctness, determinism, build, and rAF deadline gates. Add motion-quality evidence:

### Automated measurements

- root and screen-space velocity continuity;
- gait phase versus traveled distance;
- foot contact drift;
- cape socket separation and deformation envelope;
- camera lag and settle time;
- source-switch discontinuity size;
- input-to-first-visible-response latency;
- long-task and dropped-frame counts.

### Visual evidence

- paired full-scene video at normal speed;
- paired 0.25× close-up video;
- contact-sheet strips at authored beats;
- desktop and mobile-width runs;
- reduced-motion run;
- complete auto journey plus manual poke/drag/back-navigation pass.

### Acceptance record

Record:

- owner review date;
- scenarios watched live;
- accepted differences;
- rejected differences;
- remaining known issues;
- explicit go/no-go decision.

Do not mark the charm checkpoint complete from a capture script or static crops alone.

## Suggested PR sequence

1. Q0 instrumentation and negative controls.
2. Q1 single gait authority.
3. Q2 render interpolation.
4. Q3 authored cape sockets and bounded secondary.
5. Q4 walk and approach pace.
6. Q5 camera motion.
7. Q6 source transitions and shared speech bubble.
8. Q6 pointer/interaction completion.
9. Q7 integrated evidence and owner checkpoint.

Each PR should include the repository's required typecheck, determinism lint, engine tests, production build, and visual review artifacts. Motion PRs must include a negative control demonstrating that the new quality metric can fail.

## Definition of done

Quality recovery is complete when:

- Dash has one visible walk phase and one visible bob;
- ordinary and signature approach speeds match their authored legacy classes;
- the cape remains attached to the visible character and preserves pose-specific silhouette;
- render output is smooth at 60/90/120 Hz without changing deterministic simulation;
- camera motion is authored or continuously integrated, not a transition chasing stepped targets;
- speech and interaction feedback use the site's shared visual language;
- the complete live journey feels equal or better to the owner;
- `parity-results.md` contains a real owner-approved acceptance record.
