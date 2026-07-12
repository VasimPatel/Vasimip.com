Commit often to maintain versioning between changes and testing
Make things modular and reusable when you can
Do not overly abstract things

# Execution model (this repo) — owner directive, 2026-07-11

**Fable implements everything directly.** The main session (Fable) writes the code,
the content, the tests, and the docs itself. Do NOT delegate implementation to any
subagent or external model — no implementer/opus/sonnet agents, no codex authoring.

**Why (owner's words, after reviewing the Engine v2 playground):** delegated phases
passed their correctness gates but the result read as charmless — "the animations are
not good… dash looks worse, far less charming and fun… motion and physics are really
half baked." Gates measure correctness; charm doesn't survive delegation. One set of
hands, one aesthetic memory.

What remains allowed:
- **Read-only exploration** (built-in Explore agent) for broad searches — it writes
  nothing.
- **Codex as a read-only, independent REVIEWER only** (`codex exec -s read-only
  "<prompt>" < /dev/null` — the `< /dev/null` is mandatory, codex hangs on open
  stdin). It has caught real blockers in every engine phase. It must never author or
  edit a line. If the owner later says otherwise, this narrows further.
- Background Bash for long-running checks/measurements.

Everything else — implementation, migrations, content authoring, tuning, wiring,
user-facing writing — is Fable's, in the main session.

## Verification discipline (keep — this part worked)

- Every increment lands with its gates: typecheck, determinism lint, `bun run
  test:engine`, `bun run build` (site dist byte-identical until P9 flips it), and
  screenshot review of anything visual. State gate evidence in commits/PRs.
- Motion/visual work is judged by looking at it (screenshot strips, live harness),
  never by numeric gates alone. Numeric gates get negative controls.
- Independent codex review (read-only) before merging engine-math or server-touching
  work.

# Engine v2 project

The plan of record is `docs/ENGINE_V2.md`. One phase per PR into master; the live
site keeps running the legacy engine untouched until Phase 9 flips it. Closed verb/
component/milestone sets — additions require explicit owner sign-off. THE WALL TEST
and the BIRD TEST are the north-star acceptance gates.

**Charm is the open risk** (owner-confirmed after P8): the legacy Dash's appeal is
bespoke per-pose hand-drawn art — expressive eyes/brows, the bandana, baked-in squash
and stretch, hand-tuned easing. Silhouette parity is not charm parity. Before any
bulk content migration (P9), the renderer/motion must pass an owner-reviewed
side-by-side charm checkpoint against the legacy site.
