# THE CODEX — build blueprint

The authoritative technical spec, synthesized by a design panel from the build
brief and hardened by an adversarial three.js review. This is the source of
truth for the implementation. (Brief lives in the project root conversation;
this is the engineering distillation.)

## One metaphor

Descent IS the book's spine IS the journey. One continuous torch-lit descent
through five depths. Every effect serves that or is cut.

## Architecture (locked)

- **One persistent `<Canvas>`**, `position:fixed` behind the DOM, never
  unmounted across depths (remount = GPU churn + a visual cut that kills
  book-ness). `frameloop="always"` (flicker is continuous).
- **Descent axis = −Y.** A `Spine` group stacks five `DepthScene` groups at
  `y = -i * DEPTH_GAP`. A `cameraRig` group is driven (never React render) by a
  compound dt-damp so the camera sinks with mass and settles dead — no overshoot.
- **Depth mount-window:** only `activeDepth−1 … activeDepth+1` are mounted;
  off-window depths dispose their geometry/textures/materials. The torch, embers,
  post, and ambient floor live **outside** the depths (parented to the rig) — the
  one constant.
- **WebGL owns** light, relief, atmosphere, embers, the constellation, and the
  page-plane mesh. **DOM owns ALL text** — real `<article>/<section>/<h2>/<p>/<a>`
  in a tall scroll column above the fixed canvas, keyboard-reachable and
  crawlable independent of WebGL. `<Html>` only for the few constellation labels.
- Both layers co-register through **one shared torch position + radius** so the
  lit vellum pool and the revealed prose are literally the same light.

## The torch (make-or-break)

A real positional light raking a procedurally **normal-mapped** vellum plane.
The anti-gradient proof is **directional relief**, not the light's falloff.

### Anti-gradient acceptance gate (corrected)

> A reasonable person must not be able to call it "a radial gradient following
> the mouse." Validated at the **CENTER** of the lit pool, not the rim:
> parchment tooth and ink ridges show **directional grazing highlight** and
> **self-shadow** that rake and crawl as the torch moves.

Normal maps perturb the shading normal (highlight crawl); they do **not** cast
shadows. So the relief is sold by two things working together:

1. **Off-axis grazing light.** The flame is held up-and-to-the-side of the aim
   point (like actually holding a torch), so light crosses the surface at a
   shallow angle where the reader looks — relief shows at pool center instead of
   washing out under head-on incidence.
2. **In-shader bump self-shadow.** A cheap height-march toward the torch
   direction darkens micro-valleys the ink/tooth occlude. This, plus the moving
   highlight, is what no CSS gradient can fake.

### Torch spec

- **Hero light:** a `SpotLight` aimed at the page (single 2D shadow map on HIGH;
  far cheaper than a PointLight's 6-face cube), positioned at a held-torch offset
  from the aim. `decay=2`, finite `distance` (keeps the dark dark; shared as the
  DOM reveal radius). Intensity is a **tuned** value gated by exposure — not a
  calibrated constant. A tiny non-shadow point light at the flame core feeds bloom.
- **Never flat #000:** `ambientLight` at `--abyss` (0.06) + a hemisphere
  sky=`--abyss`/ground=`--ink` (0.05), so shadow sits at cool ink, not black.
- **Vellum material:** `MeshStandardMaterial` (`#EAD9AE`, roughness 0.92)
  extended via `onBeforeCompile` — keep three's PBR + shadow chain, inject only:
  a **world-position varying** (stock shader has none), the warm-ramp LUT sample,
  and the self-shadow term. Set `customProgramCacheKey` per depth/ramp variant;
  retain the uniforms ref and push `uTorchPos/uTorchRadius/uFlicker` each frame;
  survive `webglcontextrestored`.
- **Warm falloff** (one light has one color → the 4-stop ramp lives in the
  shader): a `256×1` RGBA `DataTexture` LUT `vellum → amber → gilt → ember → ink`,
  sampled by normalized distance to the torch. DataTexture **must** be
  `generateMipmaps=false`, Linear min/mag, ClampToEdge, explicit colorSpace,
  `needsUpdate=true` — or it samples black on real drivers. Depths II/III bias the
  cold end toward `--verdigris`; IV/V bias warm.
- **Procedural normal map (zero shipped binaries):** height = ink/illustration
  canvas luminance (raised ridges) + 3–4 octaves of `simplex-noise` v4
  `createNoise2D(seededRng)` (parchment tooth). Height→normal via a one-shot GPU
  Sobel pass into a `WebGLRenderTarget`. Per-tier res (1024/512/256), cached per
  depth, disposed off-window.
- **Flicker (the ONLY fast motion):** `createNoise3D` drives `intensity`
  (±~12%, irregular, never sinusoidal) + sub-perceptual position jitter + ~3%
  warmer on dim troughs. **Reduced-motion kill switch:** lock intensity to base,
  zero jitter — the torch still *tracks* the cursor, just emits steady light.
- **Embers:** GPU `THREE.Points` (additive, `depthWrite=false`) parented to the
  torch; vertex-shader advection +Y with simplex drift, color from the LUT by
  age. Counts 600 / 120 / 12·0 per tier. Keep point sizes under the mobile
  `ALIASED_POINT_SIZE_RANGE` cap. Returning readers seed extra embers.
- **Bloom:** `EffectComposer` **must** use `frameBufferType=HalfFloatType` (HDR)
  or emissive>1 and thresholds are meaningless. The renderer's ACES tone-map is
  **disabled** (`NoToneMapping`) when the composer mounts its own `<ToneMapping>`
  — never double-map. Flame core is an emissive HDR mesh; tune emissive so only
  the core exceeds threshold (plain `<Bloom>` is luminance-gated, not layer-based;
  use a selection if needed). On LOW: no composer at all (the #1 mobile
  frame-killer) — an additive radial glow sprite stands in (~85% of the look).
- **2D fallback (MINIMAL tier / weak GPU / 3D init fail):** a full-screen
  `ScreenQuad` with one shader sharing the **same** `torchLighting` GLSL include,
  the same generated normal map, the same LUT, the same torch store. Relief still
  rakes → still not a gradient.

## Motion (locked)

Weight, not bounce. Allowed eases only: `power3.in` (fall), `power2.out`
(settle), `power2.inOut` (mood), `power3.inOut` (turn). **Banned everywhere:**
back, elastic, bounce, any overshoot/spring. react-spring is deliberately not a
dependency. Lenis is the single RAF source; GSAP follows (`gsap.ticker.add`,
`lagSmoothing(0)`). The master timeline is **scrubbed** to scroll progress (no
spring by construction); a second dt-damp on `smoothDepth` gives the settling
mass. Page-turns: hinged vertex-bend, `power3.in` fall → `power2.out` thud,
velocity-clamped ≥900ms, no back/elastic.

## Reveal + reading mode

- **Opacity-only** over content that always exists (never `display:none` /
  `visibility:hidden` / `aria-hidden`). One throttled rAF reads cached rects +
  torch screen pos → writes `--lit` per element. `opacity: calc(var(--reading) +
  (1−var(--reading)) * var(--lit))`.
- `:focus-within` forces a section's `--lit:1` (keyboard reveals without aiming).
- **Reading mode** (`RAISE THE LIGHTS`, mandatory): visible button, `aria-pressed`,
  key `L`, persisted. Lifts ambient, sets `--reading:1`, softens (not kills) the
  torch. Auto-suggested under reduced-motion / low tier. Independent of reduced
  motion.
- `prefers-reduced-motion` raises a global `--reveal-floor` (~0.85) so reveal is
  never a motion-dependent hunt.

## State (zustand)

`descentStore` (progress/smoothDepth/activeDepth), `torchStore`
(aim/worldPos/screenPos/intensity), `revealStore` (registry+lit cache),
`uiStore` (readingMode), `motionStore` (reduced), `perfStore` (tier+flags),
`discoveryStore` (session), `journeyStore` (**persisted** `codex.journey.v1`,
versioned, debounced, event-driven — never per frame), `oracleStore` (Phase-2).
No per-frame React setState anywhere — refs + uniforms only.

## Living map (The Works)

Build-time bake (`scripts/bake-github.mjs`, REST, unauthenticated-capable,
resilient) → `public/data/github.json` (committed fallback). Rendered as a
torch-lit `InstancedMesh` constellation: languages = regions, repos = stars,
each a tiny raised gilt boss the torch lights region-by-region. Lit regions
latch to `journey.mapNodesLit`. Labels are projected DOM `<Reveal>` links
(crawlable). Top-N per tier.

## Perf tiers

One `perfStore.tier` every subsystem reads, set by a boot GPU/FPS probe +
`<PerformanceMonitor>` watchdog (`AdaptiveDpr`/`AdaptiveEvents`). HIGH (shadows,
bloom, 600 embers, 1024 normal, dpr[1,2]) / REDUCED (no shadow map, sprite glow
or light bloom, 120 embers, 512, dpr[1,1.5]) / MINIMAL (2D ScreenQuad torch, no
composer, 12·0 embers, 256, dpr 1, reading mode default-on). Descent damping is
dt-based so a hot phone sheds embers/bloom before the descent ever stutters.

## Mobile

Touch-drag aim (primary), gyro opt-in behind iOS permission (default off, auto-
off under reduced motion). A draggable `TorchHandle` grip disambiguates aim vs
scroll. The guaranteed no-aim path is reading mode (auto-suggested first mobile
visit).

## Dependencies (pinned)

three `0.184.0` **exact** (postprocessing caps `<0.185`; @types/three matched),
@react-three/fiber 9, drei 10, @react-three/postprocessing 3 + postprocessing
6.37+, gsap 3.13+, lenis 1.3+, zustand 5, simplex-noise 4. **No** vite-plugin-glsl
(Vite 8 risk — shaders are TS strings), **no** maath (use a dt-damp helper), **no**
@octokit (the bake uses `fetch`). Vite 8 + plugin-react 6 on Node 23.

## Open risks (watch list)

Lenis+GSAP+pinned-canvas triple bridge jitter (isolate in one `useLenis`); first-
reveal hitch from canvas raster + Sobel (cache + small on LOW); reveal desync
during fast scroll (rect cache invalidated on scroll/resize; reading mode is the
backstop); bloom blowout in reading mode (raise threshold); mobile context loss
(rebuild generated textures from seed on `webglcontextrestored`); a11y regression
(gate on: dimmed text still focusable + queryable).
