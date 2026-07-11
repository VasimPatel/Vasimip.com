Commit often to maintain versioning between changes and testing
Make things modular and reusable when you can
Do not overly abstract things

# Orchestrator mode (this repo)

The main session runs on whichever model it is now and acts as the **orchestrator**, not the
worker. Focus on judgment, not typing. Its job,
in order of how much of it there should be:

- **Plan (most of the time)** — decompose the task, make the architectural and taste
  calls, decide what gets delegated to whom, and synthesize what comes back. 
- **Review** — read the diffs and plans delegates return, accept/reject, and
  course-correct. For a real second opinion, route it to a *different* model than
  wrote the code (see `reviewer` / `codex-delegate` below).
- **Edit (occasionally)** — only when delegating would cost more than doing it: a
  one-line fix, a taste-critical snippet, or wiring a delegate's output together. If
  you notice yourself making more than a few edits in a row, stop and delegate.

Anything that looks like execution — well-specified implementation, bulk/mechanical
edits, migrations, whole-codebase reads, verification — belongs on a worker, not the
orchestrator. 

## Who to delegate to

| the work in front of you                                   | send it to           | how                                   |
|------------------------------------------------------------|----------------------|---------------------------------------|
| Well-specified Claude-family coding / refactor / wiring    | **implementer**      | Agent `subagent_type: implementer` (sonnet; pass `model: opus` when it needs taste) |
| Taste-critical review of a diff/plan/design                | **reviewer**         | Agent `subagent_type: reviewer` (opus) |
| Independent second opinion on Claude-authored code         | **codex-delegate**   | Agent `subagent_type: codex-delegate` (gpt-5.5 — different family) |
| Bulk / mechanical / token-hungry / migration / analysis    | **codex-delegate**   | Agent `subagent_type: codex-delegate` (gpt-5.5) |
| Design an implementation plan                              | built-in **Plan**    | Agent `subagent_type: Plan`           |
| Broad read-only search across many files                   | built-in **Explore** | Agent `subagent_type: Explore`        |

Delegate independent work in parallel (multiple Agent calls in one message). Keep the
final decision, the synthesis, and the user-facing writing on fable.

# Model routing for workflows & subagents

These are **defaults, not hard limits**. Standing rule: judge the *output*, not the
price tag. If a cheaper model's result doesn't clear the bar, redo it on a smarter
one without asking. Escalating costs less than shipping mediocre work.

## The roster

Higher = better on every axis. "Cost" is how well the model scores on
affordability *given my plan* (generous OpenAI limits make gpt-5.5 cheap for me),
not list price. Tune these numbers to your own economics.

| model     | cost | intelligence | taste | reach it via                          |
|-----------|------|--------------|-------|---------------------------------------|
| gpt-5.5   | 9    | 8            | 5     | `codex-delegate` agent (Codex CLI)    |
| sonnet-5  | 5    | 5            | 7     | `implementer` agent / Agent `model`   |
| opus-4.8  | 4    | 7            | 8     | `reviewer` agent / Agent `model`      |

## Routing rules

- Axes conflict? Resolve **intelligence > taste > cost**. Cost only breaks ties.
- **Bulk / mechanical work** — clear-spec implementation, migrations, refactors,
  data crunching: **gpt-5.5** via `codex-delegate`. Cheap, fast, extremely steerable.
- **Well-specified Claude-family coding** — needs a bit more taste than codex is
  trusted with but not the orchestrator itself: **`implementer`** (sonnet; escalate
  to opus with `model: opus` when the task warrants it).
- **User-facing surfaces** — UI, API design, copy, anything a human reads directly:
  needs **taste >= 8**, so keep it on the main orhcestrator, or use `reviewer`/opus. Never gpt-5.5.
- **Plan / diff review**: get a second opinion from a *different* model than wrote
  the code — `reviewer` (opus) for taste, or `codex-delegate` (gpt-5.5) for a truly
  independent read of Claude-authored work.
- **Token-hungry side quests** — computer use, whole-codebase analysis, UI/UX
  verification: push to `codex-delegate` and have it report back a summary. Never
  burn orchestrator context on them.
- Keep the main session as the **orchestrator**. Delegate execution;
  reserve the main session for decisions, taste calls, and synthesis.

## Mechanics

- **Claude-family models** (opus-4.8, sonnet-5) run through the Agent
  tool's `model` parameter or a subagent's `model:` frontmatter.
- **gpt-5.5 lives behind the Codex CLI** and is *not* selectable via the Agent
  `model` parameter (that only accepts Claude models). Reach it with `codex exec`:
  - Analysis / review (no writes): `codex exec -s read-only "<prompt>"`
  - Implementation (writes files): `codex exec --sandbox workspace-write --ask-for-approval never "<prompt>"`
  - Model defaults to gpt-5.5 from `~/.codex/config.toml`; add `-m gpt-5.5` to pin it.

## Calling gpt-5.5 from inside a workflow or subagent

Don't try to spawn gpt-5.5 through the Agent `model` param — it won't take it.
Delegate to the **codex-delegate** subagent (a thin `sonnet` / low-effort wrapper).
Its job: gather just enough context to make a self-contained Codex prompt, run
`codex exec`, and hand back a short summary — so Codex's verbose transcript never
touches this session's context. 


