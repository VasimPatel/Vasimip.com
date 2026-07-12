---
name: reviewer
description: "RETIRED (owner directive 2026-07-11). Do not use. Fable implements everything directly in the main session — see CLAUDE.md 'Execution model'."
disabled: true
---

Retired by owner directive on 2026-07-11: implementation, content, and reviews are
no longer delegated to subagents. Fable (the main session) does the work directly.
Codex may be used ONLY as a read-only independent reviewer via direct Bash
(`codex exec -s read-only ... < /dev/null`), never through this agent.
