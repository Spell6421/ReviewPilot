# GSD Usage Guide — how this project is run

> A reference for the *mental model* and *day-to-day rhythm* of GSD on Backbooked.
> For installing the `/gsd-*` commands and the one-time brownfield onboarding, see
> [`docs/gsd-setup.md`](gsd-setup.md). For the product itself, see
> [`docs/product-vision.md`](product-vision.md).

## The mental model: four nested levels

GSD organizes work as four nested levels. Knowing which level you're at tells you which
command to reach for.

```
PROJECT.md    ← the whole product (Backbooked). Lives forever, evolves at boundaries.
  └─ Milestone    ← one body of work (e.g. "make the automation layer smart"). Cycles.
       └─ ROADMAP.md   ← the phases for the CURRENT milestone only
            └─ Phase   ← one capability, run through: discuss → plan → execute → verify
```

| Level | File / form | What it is | Changes how often |
|-------|-------------|------------|-------------------|
| **Project** | `.planning/PROJECT.md` | North star for the *entire* product — all four layers, core value, validated vs. active requirements, out-of-scope with reasons | Rarely; evolves at phase/milestone boundaries |
| **Milestone** | (a roadmap + its phases) | One scoped chunk of the product you drive to "done" before starting the next | Per cycle (you start a new one with `/gsd-new-milestone`) |
| **Roadmap** | `.planning/ROADMAP.md` | The ordered phases for *this* milestone, each mapped to requirements | Once per milestone |
| **Phase** | `.planning/phases/NN-*/` | A single end-to-end capability | The unit you actually execute |

The key idea: **PROJECT.md is broad and permanent; the ROADMAP is narrow and disposable.**
You keep PROJECT.md as an accurate description of the whole product, but only ever have one
small roadmap in flight. This is what fights "context rot" — you never load the whole product
into one working session.

## Why we go one layer per milestone

Backbooked is four layers (integration, automation, communication, analytics) plus billing.
Rather than one giant roadmap, we scope **one layer per milestone** and finish it before
starting the next. Smaller roadmaps = tighter context = better plans and execution.

Current sequencing (see `.planning/PROJECT.md` for the authoritative version):

1. **Automation layer — make it smart** ← *current milestone*
2. Communication inbox
3. Analytics / ROI dashboard
4. Stripe billing
5. Integration layer (un-assumes the data the earlier layers pretended was "piped in")

> **Build assumption while integrations are deferred:** appointment history, phone numbers,
> and missed-call events are treated as already "piped in." We seed that data manually/CSV
> and code against it; we do *not* build Square/GlossGenius/OAuth until the integration
> milestone.

## The per-phase loop

Each phase in the roadmap goes through the same loop. You run these as `/gsd-*` commands,
clearing context between the big ones:

```
/gsd-discuss-phase N     # gather context, clarify approach   → CONTEXT.md
/gsd-plan-phase N        # research + write the executable plan → RESEARCH.md, PLAN.md
/gsd-execute-phase N     # build it (parallel plans)            → code + commits
/gsd-verify-work N       # confirm it satisfies the requirements → VERIFICATION.md
```

- **Discuss** is optional but recommended while you're learning — it clarifies *how* before
  planning locks it in. You can skip straight to `/gsd-plan-phase N`.
- **Research / Plan-check / Verifier** are agents enabled in `.planning/config.json`. They
  add a little time but catch gaps early (this project has them all on).
- `/clear` between phases (and before big commands) keeps each session focused.

If a phase has a meaningful frontend surface, `/gsd-ui-phase N` produces a UI design contract
before planning.

## The milestone cycle

When all phases in a roadmap are done:

```
/gsd-complete-milestone   # archive the roadmap, roll PROJECT.md forward
                          #   (active requirements → validated)
/gsd-new-milestone        # frame the next layer, build a fresh roadmap
```

So after the three automation phases ship, `/gsd-complete-milestone` then `/gsd-new-milestone`
starts the **communication inbox** layer with a clean roadmap. Repeat for analytics, billing,
integrations. PROJECT.md carries forward the whole time.

## Handy commands

| Command | When |
|---------|------|
| `/gsd-progress` | "Where am I? What's next?" — the situational catch-all |
| `/gsd-plan-phase N` | Plan a phase directly (skip discuss) |
| `/gsd-quick` | Small fixes / docs / ad-hoc tasks (still gets atomic commits + state tracking) |
| `/gsd-settings` | Change mode, granularity, model profile, which agents run |
| `/gsd-new-milestone` | Start the next layer once the current one is done |

## This project's config (set at init, 2026-06-03)

- **Mode:** interactive (confirm at each step)
- **Granularity:** standard
- **Execution:** parallel plans
- **Model profile:** quality (Opus for research/roadmap, Sonnet elsewhere)
- **Agents on:** research, plan-check, verifier
- Change any of these with `/gsd-settings`.

## Current state

**Milestone:** Automation layer — make it smart. **Roadmap (3 phases):**

1. **Appointment History Foundation** — store per-visit `Appointment` records; seed manually/CSV.
2. **Predictive Rebooking** — learn each customer's cadence (avg/median gap), nudge when
   overdue, with a default fallback; replaces the fixed 60–120 day window.
3. **Staged Win-Back** — multi-touch (~60/120/360) recovery, sequential *after* rebooking
   (a rebooked-but-still-cold customer still gets win-back), never double-touching in one run.

**Next action:** `/clear`, then `/gsd-discuss-phase 1`.

See `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` for the full detail.
