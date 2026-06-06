# .planning/

Lean, **hand-maintained** project-state docs. (The project offboarded from the GSD tooling on
2026-06-06; the old GSD process artifacts — `config.json`, `STATE.md`, `phases/`, `codebase/`
maps — were removed. What remains is the small set of docs worth keeping current by hand.)

These are the docs to read/update during a **state eval** ("where are we, what's next?"). Keep
them honest and in sync with the code — drift here is what makes a state eval lie.

| Doc | Answers | Update when |
|-----|---------|-------------|
| [`PROJECT.md`](PROJECT.md) | What is this, why, core value, scope boundaries, key decisions | Milestone boundaries; a scope/decision changes |
| [`ROADMAP.md`](ROADMAP.md) | Where we are, the phases, success criteria, what's next | A phase completes or is added; status changes |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Atomic requirement checklist (done vs pending) + out-of-scope | A requirement ships or is added/cut |
| [`CONCERNS.md`](CONCERNS.md) | Known debt, risk, fragile areas, missing capabilities | Debt is taken on or paid down |

**Engineering source of truth lives outside `.planning/`:** `AGENTS.md` (always-on guide,
imported by `CLAUDE.md`) and `docs/engineering-guide.md` (full reference). Architecture,
conventions, file tree, and data model are documented there — not duplicated here.
