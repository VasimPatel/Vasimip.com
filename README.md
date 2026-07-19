# Dash's Notebook — vasimip.com

An interactive comic-book portfolio: a two-sided spiral notebook you flip
through, inhabited by **Dash**, a hand-drawn stick-figure hero who walks,
vaults, wall-runs, tightropes, sword-fights, and bomb-escapes his way between
the panels of each spread. Every page, panel, line of copy, and Dash stunt is
**data** (`src/notebook/notebook.json`), edited live through a WYSIWYG portal
at `/admin`.

Under the hood Dash is driven by **Engine v2** — a deterministic, 120 Hz
fixed-step 2D character engine (plan of record: `docs/ENGINE_V2.md`) that also
runs headless on the server for validation and byte-identical replay.

---

## Repo map

| Path | What it is |
|---|---|
| `src/notebook/` | The site: `Notebook.tsx` (shell, camera, flips, legacy Dash), `PageRenderer`/`CoverRenderer` (two-sided sheets), `engine/EngineLayer.tsx` (the engine-driven Dash + staged choreographies), `registry/` (art components like the battle scene), `doc/` (doc types, validation, spread mapping, action compiler), `notebook.json` (the baked content doc). |
| `src/admin/` | The `/admin` WYSIWYG editor: page rail (rename/delete/add), front/back canvas, panel/box inspector, Dash Dojo (custom action editor), friends'-panels inbox, history, auth client. |
| `packages/schema/` | `@dash/schema` — closed-set validators for every doc kind (world, character, poses, clips, behaviors, skins) + the v1→v2 notebook migration. |
| `packages/engine/` | `@dash/engine` — the deterministic sim: locomotion (walk/hop/jump/fly + route planning), behavior runtime (intents, cues, reactions, watchdog), blender/acting layer, verlet secondary motion, world model + traversal graph. No DOM, no clocks, no `Math.random`. |
| `packages/renderer-svg/` | `@dash/renderer-svg` — draws the rig as SVG; applies the hand-drawn **data skins**; `dev/extract-skins.mjs` regenerates skins from the legacy art. |
| `packages/headless/` | `@dash/headless` — `validate()` / `simulate()` over the same engine; powers tests, CI gates, and the server's `/api/validate` + `/api/simulate`. |
| `content/engine/` | Engine content: `character.dash.json`, `rig.dash.json`, `poses/`, `clips/`, `skins/` (+ `keyframes.json`), `behaviors/builtin/` (the travel verbs). |
| `server/` | Bun + **Hono** API & static server: Better Auth (passkey + magic-link, owner-only), notebook doc CRUD with revisions, invites + friend submissions, owner-gated engine endpoints, Drizzle migrations + seed on boot. |
| `server/db/` + `drizzle/` | Postgres schema (`notebook_current`, `notebook_revisions`, `invites`, `submissions`, auth tables) and generated migrations. |
| `plugins/notebook-admin.ts` | Vite dev middleware: file-backed `/api/notebook` (GET/PUT against `src/notebook/notebook.json`) so `/admin` works with **no server and no database**. |
| `scripts/` | Dev/QA harnesses (see [Testing & gates](#testing--gates)). |
| `docs/` | `ENGINE_V2.md` (the plan of record), `engine-v2/` (parity/quality evidence, acceptance gates). |
| `Dockerfile`, `railway.json` | The production build + Railway deploy config. |
| `DEPLOY.md` | **The owner's step-by-step Railway deploy runbook** — read it before deploying. |

Routes served by the app:

| Route | What you get |
|---|---|
| `/` | The notebook, **engine mode** (default — Engine v2 drives Dash). |
| `/legacy` (or `?legacy=1`) | The untouched legacy CSS/tween Dash — the side-by-side comparison baseline. |
| `/admin` | The WYSIWYG editor (passkey / magic-link owner login in production; open in dev). |

---

## Prerequisites

- **[Bun](https://bun.sh) ≥ 1.x** — runtime for everything (dev server, tests, server, workspaces).
- **Node** — only for the puppeteer QA scripts (`node scripts/…`).
- **Google Chrome** (desktop install) — the QA harnesses drive it via
  `puppeteer-core` at `/Applications/Google Chrome.app/…` (macOS path;
  adjust `CHROME` in the scripts elsewhere).
- **PostgreSQL** — only for full-stack/server work and production. The
  front-end + admin run fine without it.

```sh
bun install     # installs the root + all packages/* workspaces
```

---

## Running it

### Front-end only (most common)

```sh
bun run dev     # Vite on http://localhost:5173 (auto-increments if taken)
```

- `/` and `/legacy` work immediately from the **baked doc**
  (`src/notebook/notebook.json`).
- `/admin` also works immediately: the `notebook-admin` Vite plugin serves a
  file-backed `/api/notebook` that reads/writes `src/notebook/notebook.json`
  directly. **Saves in dev edit that file — commit the JSON when you're happy
  with the content.** (Auth fails open in dev when no server is running.)

### Full stack (server + Postgres)

```sh
# 1. A local Postgres, e.g.:
docker run -d --name notebook-pg -p 5432:5432 -e POSTGRES_PASSWORD=pg postgres:16

# 2. Environment (dev is lenient — only DATABASE_URL is required):
export DATABASE_URL=postgres://postgres:pg@localhost:5432/postgres
export OWNER_EMAIL=you@example.com          # the ONE address allowed to log in

# 3. The server — migrates + seeds on boot (idempotent, advisory-locked):
bun run start                               # Hono on http://localhost:8787
```

- `bun run start` serves `dist/` if it exists (run `bun run build` first for a
  prod-like run) plus all `/api/*` routes.
- For **dev with the real server**, run `bun run dev` in a second terminal:
  Vite proxies `/api/*` to `:8787` (see `vite.config.ts`), so auth, invites,
  history, and the engine endpoints hit the real stack. **Exception, by
  design**: `/api/notebook` is intercepted by the file middleware *before*
  the proxy — dev doc edits always go to the local `notebook.json` file, not
  the DB (and the history menu hides itself in file mode).
- **First login**: with no `RESEND_API_KEY`, the magic-link URL is printed to
  the server log — open it, then register a passkey from the admin.
- DB scripts: `bun run db:generate` (new migration from schema changes),
  `bun run db:migrate`, `bun run db:seed` (seeds `notebook_current` from the
  baked file if empty).

### Content flow between dev and prod

- The DB is the source of truth in production; the repo's `notebook.json` is
  the **seed + offline fallback**.
- `bun run pull-doc` (or `BASE_URL=https://vasimip.com bun run pull-doc`)
  pulls the live doc back into `src/notebook/notebook.json` so prod content
  can be committed. It refuses to clobber uncommitted local edits.

---

## The engine (what makes it tick)

- **Determinism is law** in `packages/engine` + `packages/headless`: no
  `Date.now`, `Math.random`, or DOM — enforced by `bun run lint:determinism`
  and golden-hash tests. Same doc + same seed ⇒ byte-identical simulation,
  in the browser, in tests, and on the server.
- The site adapter (`EngineLayer.tsx`) owns **presentation**: cameras, staged
  legacy choreographies (poof, swing bar, wall-run climb, rope glide, page
  surfing), sfx, speech bubbles, drag/poke. The sim never cheats; the adapter
  may (exactly like the legacy CSS did).
- Content sets are **closed**: verbs, components, and milestones are fixed;
  additions need explicit owner sign-off. Poses/clips/skins/behaviors are
  open *content* under `content/engine/`.
- Regenerating skins from legacy art:
  `node packages/renderer-svg/dev/extract-skins.mjs` (writes
  `content/engine/skins/*.json`; single-pose runs won't clobber
  `keyframes.json`).
- Golden files: re-record with `REGEN_GOLDENS=1 bun test packages/...` —
  only when a timing/content change is *intentional*, and eyeball the diff.

---

## Testing & gates

The standing bar for any change (run all of these before a PR):

| Command | What it checks |
|---|---|
| `bun run typecheck` | 7 tsc programs: site, node, server, and all 4 packages. |
| `bun run test:engine` | `bun test packages` — all workspace tests (engine, schema, headless, renderer): behavior runtime, locomotion, traversal, snapshot/restore bit-identity, golden hashes, THE WALL TEST, content validation. |
| `bun run lint:determinism` | ESLint determinism rules over engine + headless. |
| `bun run build` | Full typecheck + Vite production build to `dist/`. |

Browser-level QA (needs Chrome + a running dev server):

| Script | What it does |
|---|---|
| `node scripts/smoke.mjs [base]` | Boots both routes, journeys, pokes, drags — fails on any console/page error. |
| `node scripts/motion-harness.mjs <out> [base] [scenario…]` | Records per-frame motion (bob, step continuity, cape socket, camera churn, ground speed) + flipbook clips; `--negative-control` proves the metrics can fail. |
| `node scripts/parity-harness.mjs <out> [base] [scenario…]` | Runs the same forced scenario on `/` AND `/legacy`, captures strips + normalized timelines for side-by-side review. |
| `node scripts/soak.mjs` | Long autoplay run across the whole book. |
| `node scripts/admin-check.mjs` | Headless admin round-trip against the dev middleware. |
| `bun server/e2e/engine-check.ts` | Boots the REAL server (migrate+seed+auth), logs in via the dev magic-link, and asserts `/api/simulate` is byte-identical to a local `simulate()` + the auth boundary holds. Needs `DATABASE_URL`. |

Review conventions: motion/visual work is judged by **looking at it**
(harness clips/strips at 0.25×), never by numeric gates alone; independent
read-only review before merging engine-math or server-touching work.

---

## Building for production

```sh
bun run build      # typecheck + vite build → dist/
```

The server (`bun server/index.ts`) then serves `dist/` with an SPA fallback,
so client routes like `/admin` resolve. `bun run preview` serves the built SPA
alone (no API) if you just want to eyeball the bundle.

---

## Deploying

> Deploys are run **by the owner, by hand**. Nothing in this repo deploys on
> its own, and CI never pushes anywhere.

### Railway (the supported path)

**`DEPLOY.md` is the full runbook** — one service built from the `Dockerfile`
(Bun image: install workspaces → `bun run build` → run `server/index.ts` as
the non-root `bun` user), plus a Postgres addon. `railway.json` wires the
build and the `/api/health` healthcheck. Push to the default branch =
auto-deploy.

Environment (production **exits** if the required ones are missing/weak):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Reference the Railway Postgres addon: `${{Postgres.DATABASE_URL}}`. |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 chars; `openssl rand -base64 32`. |
| `OWNER_EMAIL` | yes | The single address allowed to sign in — every other signup path is refused at a DB hook (no enumeration). |
| `BASE_URL` | yes | The exact public origin (`https://…`); Better Auth signs cookies/links against it — a mismatch = silent login failure. |
| `RESEND_API_KEY` | optional | Magic-link email delivery; without it the link is printed to the deploy logs (fine for bootstrap). |
| `RESEND_FROM` | optional | From-address for those emails. |
| `PORT` | injected | Railway sets it; local default 8787. |

Boot order inside the container: env hard-checks → advisory-locked Drizzle
migrations → idempotent seed (baked `notebook.json` → `notebook_current` if
empty) → listen. Concurrent replicas can't double-migrate.

After the first deploy: open `/admin`, use the magic link from the logs (or
Resend), **register a passkey**, then author content in `/admin` — and
periodically `bun run pull-doc` locally to commit the live doc back to git.

### Docker anywhere else

The `Dockerfile` is platform-agnostic: any host that can run a container +
reach a Postgres works (Fly, a VPS, etc.). Provide the same env vars; expose
the port; point healthchecks at `/api/health`.

### Static-only hosting (not recommended)

Any static host can serve `vite build` → `dist/`: the site runs from the
baked doc, but there is **no admin persistence, no auth, no invites, no
engine API**. Fine as a mirror; Railway (Dockerfile) is the real deployment.

---

## Security & operational notes

- **Owner-only auth**: passkey primary, magic-link fallback; account creation
  is gated to `OWNER_EMAIL` inside a database hook so every signup path is
  covered. Auth rate-limiting and secure cookies switch on with
  `NODE_ENV=production` (baked into the Dockerfile).
- **Doc safety**: every `/api/notebook` PUT validates against the closed-set
  doc validator, is revision-checked (409 on concurrent edits — the admin
  shows a conflict banner), and lands in `notebook_revisions` (history is
  browsable in the admin).
- **The one public write** — friend submissions via invite token — is fenced:
  64 KB cap, text+draw-only subset validator, per-token AND hashed-per-IP
  sliding-window rate limits, transactional use counts, uniform 404s.
- **Engine endpoints** (`/api/validate`, `/api/simulate`) are owner-gated and
  defense-in-depth capped (body size, tick clamp, wall-clock guard) — they
  exist for the admin save/dry-run flow, not the public.
- Strict CSP via Hono `secureHeaders` (self + Google Fonts only).
- Health: `GET /api/health`.

---

## More docs

- `DEPLOY.md` — the Railway deploy runbook (start here to ship).
- `docs/ENGINE_V2.md` — the engine plan of record (phases, gates, WALL TEST).
- `docs/engine-v2/` — parity/quality review evidence and acceptance records.
- `AGENTS.md` / `claude.md` — working agreements for AI-assisted development
  (execution model, review discipline, what stays owner-only).
