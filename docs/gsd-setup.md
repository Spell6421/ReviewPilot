# Using GSD with Claude Code on this repo

GSD ([open-gsd/gsd-core](https://github.com/open-gsd/gsd-core)) is a spec-driven dev
framework that fights "context rot" by running research / planning / execution in
fresh-context subagents, looping per milestone: **discuss → plan → execute → verify → ship**.
It installs as `/gsd-*` slash commands + agents into Claude Code.

This repo (Backbooked) is an **existing/brownfield** codebase, so use the onboarding flow
below — not a cold `/gsd-new-project`.

## Prerequisites
- Node 18+ and Claude Code (both already present).

## 1. Install the commands

Pick a scope, then run **in your terminal** (the installer is interactive; a Claude session
can't run it for you):

```bash
# Global — tooling lives in ~/.claude, nothing added to this repo  (recommended for solo work)
npx @opengsd/gsd-core@latest --claude --global

# …or Local — tooling lives in this repo's .claude/ (commits ~86 files; share with a team)
npx @opengsd/gsd-core@latest --claude --local
```

⚠️ **Use the installer — never hand-copy files** from the repo's `agents/`/`commands/`.
It applies per-runtime transformations; raw copies fail schema validation.

Scope note for this repo: it already has a `.claude/` (with a gitignored
`settings.local.json`). A **local** install adds ~86 *tracked* files there — you'd then
decide commit vs. gitignore. **Global** keeps all tooling out of the repo; only the
`.planning/` artifacts below land in-repo. Solo → go global.

## 2. Restart Claude Code
New `/gsd-*` commands only load on a fresh session.

## 3. Map the codebase (brownfield step)
```
/gsd-map-codebase
```
Spawns 4 parallel mapper agents (~1–5 min) → writes `.planning/codebase/`:
`STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`,
`INTEGRATIONS.md`, `CONCERNS.md`. Our `AGENTS.md` + `docs/product-vision.md` feed this and
make the map sharper.

## 4. Frame the project (what you're *adding*)
```
/clear
/gsd-new-project
```
Writes `.planning/` → `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`.
Frame it as the Backbooked pivot (the four layers in `docs/product-vision.md`).

## 5. Per-phase loop
```
/gsd-discuss-phase 1     # → .planning/phases/01-*/CONTEXT.md
/gsd-plan-phase 1        # research agents → RESEARCH.md + NN-NN-PLAN.md
/gsd-execute-phase 1     # parallel execution
/gsd-verify-work 1
/gsd-ship 1              # PR + archive
```

## Caveats for this repo
- **`--dangerously-skip-permissions`:** GSD suggests launching with it so parallel agents
  don't stall on prompts. It disables **all** permission gating — risky against a repo with
  live secrets in `.env.local`. You can run GSD without it and just approve actions; only use
  the flag in a throwaway/sandboxed checkout.
- **Two roadmaps:** GSD generates its own `.planning/ROADMAP.md`, separate from the 4-layer
  roadmap in `AGENTS.md`. Pick one as source of truth or consciously keep them in sync.
- **`.planning/` in git:** decide up front whether to commit it (shared planning history) or
  gitignore it (keep the repo lean). It's repo content regardless of install scope.

## Where we are now
GSD has taken over. The **feedback-gated review flow** is **done and confirmed end-to-end**
(`Feedback` model + migration, `lib/feedback.ts`, send-path wiring, the public rating page at
`app/feedback/[token]/` with high→Google / low→private-inbox routing, the `findReviewFollowUps`
already-rated exclusion, and the owner feedback-inbox seed at `app/(app)/feedback/`).

The project has been initialized through `/gsd-new-project` (2026-06-03). We're now driving the
product **one layer per milestone** (integrations are *assumed* for now — see
[`docs/gsd-usage-guide.md`](gsd-usage-guide.md) for the mental model and full sequencing).

**Current milestone — Automation layer (make it smart)**, a 3-phase roadmap:
1. Appointment History Foundation — per-visit `Appointment` records, seeded manually/CSV.
2. Predictive Rebooking — per-customer learned cadence, replacing the fixed 60–120 day window.
3. Staged Win-Back — multi-touch (~60/120/360), sequential after rebooking.

**Next action:** `/clear`, then `/gsd-discuss-phase 1`. See `.planning/ROADMAP.md`,
`.planning/REQUIREMENTS.md`, and `docs/gsd-usage-guide.md` for the full detail.
