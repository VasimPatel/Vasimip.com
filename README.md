# The Codex

An illuminated codex you read by torchlight in the dark, structured as a single
**descent** through five depths. You arrive at the surface, take up the torch,
and go *down and in* — depth by depth — through a drowned, buried world. Prose
and illustration live in the dark and bloom into view only where the light falls.
The torch is the one constant; reading is exploring.

The text is **fiction** — an invented record of a descent (no real person,
place, or work). The descent is **discrete and choreographed**: you move one
depth at a time with a weighted plunge and a turning page, never an infinite
scroll.

Built with **Vite + React + react-three-fiber** (the torch is a real WebGL light,
not a CSS gradient), **GSAP** for the choreographed transitions, and **zustand**
for state. See [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) for the engineering spec.

---

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # typecheck + production build to dist/
pnpm preview      # serve the build locally
```

Node ≥ 20.19 / 22.12 (developed on Node 23). Package manager: pnpm.

## Controls

| Action | Does |
|---|---|
| Move the cursor / drag (touch) | Carry the torch — light reveals the page |
| **Scroll / ↓ / Space / the HUD chevron** | Descend one depth (a choreographed plunge) |
| **↑ / the depth markers** | Go back up / jump to any depth |
| **Press `L`** / the **Raise the lights** button | Reading mode — lifts the page fully legible, no aiming |

The page never free-scrolls; each move is a deliberate, weighted transition.
Everything is in the DOM and reachable by keyboard with the lights up — the torch
is enhancement, never the only path to the content.

---

## Editing the pages

There is **one file to edit**: [`src/content/pages.ts`](src/content/pages.ts). Each
of the five pages is one entry that bundles three things together:

1. **the heading** — roman numeral, title, the short kicker beside it;
2. **the words** — an `epigraph` plus `blocks` (`lead`, `p` paragraphs, `margin`
   marginalia, hidden `aside` illuminations revealed only by a lingering torch, and
   optional `link`s) — it's fiction, change it freely;
3. **the look** — a `theme` mapping **colour + ink style** to that page: the ink
   accent, the lit `substrate`, how the ink moves (`flow` / `energy` / `scale` /
   `density`), and the scene mood (`ambient` / `fog` / `rampCold` / `tilt`).

**Colours are mappable.** Any colour field takes either a **named palette token**
(e.g. `'verdigris'`, `'amber'`, `'parchment'`) or a **raw hex** (e.g. `'#C6CCB6'`).
The named tokens live in [`src/lib/palette.ts`](src/lib/palette.ts) — add your own
there and reference them by name. `pages.ts` is the single source of truth: the
prose (`CONTENT`), the titles + scene mood (`DEPTH_DEFS`), and the living-ink shader
config (`INK_CONFIG`) are all **derived** from it, so one edit updates everything in
step. To add, remove, or reorder pages, edit the id list `DEPTHS` in
[`src/lib/depths.ts`](src/lib/depths.ts) (one id per page entry).

The constellation in The Drowned Archive ([`src/scene/map/LivingMap.tsx`](src/scene/map/LivingMap.tsx))
is procedurally generated and entirely fictional — no external data, no keys.

## The living ink

Behind each depth's text the page is a sheet of **dancing ink** — a single full-resolution
GPU fragment shader ([`src/scene/ink/inkMaterial.ts`](src/scene/ink/inkMaterial.ts)), not a
canvas texture. Domain-warped flow fields make the ink swirl, gather, and dissolve over time
like ink dropped in water; the torch **swirls and gathers** the ink toward the flame and
**reveals** it from the dark (you see it where the light falls). Each depth gives the ink its
own colour, drift, energy and substrate temperature, so the motion reads as a different mood as
you descend:

- **The Threshold** — sparse, calm, warm ink rising on warm vellum.
- **The Drowned Archive** — a cold horizontal current over cool verdigris parchment.
- **The Verdigris Menagerie** — the coldest, most restless dance, grey-green and breathing.
- **The Ember Court** — warm ink rising like flame and smoke as the page warms again.
- **The Last Leaf** — gilt ink drifting gently down on a pale, neutral, fully-lit page.

The shader composes on a **light substrate** (warm vellum up top, cooling as you descend) so the
dark-ink prose reads over it, and keeps the central reading column lighter for legibility. It
runs through three's tonemapping + colour-space chunks, so it sits in the same ACES pipeline as
the rest of the scene. The ink **dances only on the page you're reading** (neighbours and
reduced motion freeze); **reading mode (L)** lifts the whole page fully legible; and on the
**minimal perf tier** the page falls back to the static parchment ([`VellumPlane`](src/scene/VellumPlane.tsx)).
To retheme a depth, edit its `theme` (ink colour, substrate, flow, energy, scale, density) in
[`src/content/pages.ts`](src/content/pages.ts) — `INK_CONFIG` is derived from it.

---

## Graceful degradation (all automatic)

- **Reading mode** — the mandatory backstop. Lifts the whole page; press `L`.
- **No WebGL** — the codex becomes a plain, fully readable dark page (pale ink on
  the blue-black ground). All content is in the DOM, so nothing is lost.
- **`prefers-reduced-motion`** — engages reading mode for legibility, locks the
  flicker (the torch still tracks), freezes embers, holds pages flat.
- **Perf tiers** — a boot GPU probe + live FPS watchdog pick **high / reduced /
  minimal** (shadows, bloom, particle counts, normal-map resolution, DPR). A hot
  phone sheds effects before the descent is ever allowed to stutter.
- **Touch** — the torch follows touch-drag; swipe up/down to descend/ascend;
  reading mode auto-suggests on the first mobile visit.

---

## Deploy (Vercel)

Static Vite build plus a serverless `api/` directory.

1. Import the repo into Vercel (framework auto-detected as Vite).
2. Deploy. `vercel.json` pins `pnpm build` → `dist/`.

Any host with serverless functions works (Netlify, Cloudflare Pages); the Phase-2
oracle just needs a function home.

## [Phase 2] Ask the Codex — the oracle

A spirit bound in the book you can query, answering **in the codex's voice**.
Shipped **dormant**: the pieces exist ([`api/oracle.ts`](api/oracle.ts),
[`src/dom/OracleSlot.tsx`](src/dom/OracleSlot.tsx),
[`src/lib/oracle/client.ts`](src/lib/oracle/client.ts)) but it is not rendered.
To awaken it:

1. Set `ANTHROPIC_API_KEY` on the host (server-side only — **never** prefixed
   `VITE_`, or Vite would inline it into the bundle).
2. Implement the model proxy in `api/oracle.ts` (the key never reaches the client).
3. Render `<OracleSlot/>` inside the last depth in
   [`src/dom/Codex.tsx`](src/dom/Codex.tsx).

---

## Architecture in one breath

One persistent `<Canvas>` fixed behind a stack of DOM depth panels. A discrete
navigator (`useDescent`) drives a GSAP tween of `position`; the camera plunges
along −Y with weight (no overshoot), the leaving page turns on its hinge, and the
DOM panels fade + plunge in step (`useDescentDom`). The torch is a real
`SpotLight` lighting a vellum plane, with the fire-colour falloff and an
in-shader self-shadow injected via `onBeforeCompile`. On capable tiers the page
is instead a **dancing-ink fragment shader** (`LivingPage` + `src/scene/ink/`)
that flows over time and is swirled/revealed by the torch in-shader, per-depth in
colour and mood; on the minimal tier it's the static parchment (`VellumPlane`).
Reveal is opacity over content that always exists. Full detail:
[`docs/BLUEPRINT.md`](docs/BLUEPRINT.md).
