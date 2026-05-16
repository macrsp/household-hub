# Household Hub — Claude Project Context

> Repo directory is `Comms`; the project/app name is `household-hub`.

## Project summary

`household-hub` is a small, trusted, household-scale communication relay. It
lets household members talk to each other through whichever channel they
prefer — web/PWA, SMS, and later email — without anyone having to use the same
app.

This is **not** a scaled public SaaS product. It is a household tool. Manual
setup is acceptable. Keep it boring and usable.

### The core architectural principle

> **The app owns the canonical conversation. SMS, email, and PWA are transport
> adapters.**

- Do **not** treat SMS as the primary data model.
- Do **not** try to emulate native group SMS or rely on carrier group-SMS
  behavior.
- Maintain canonical messages in the database (`messages` table) and fan them
  out to each participant through their preferred endpoint.
- Keep transport adapters (SMS, email, app) strictly separate from the
  canonical message logic and fanout.

      PWA/App  --->  canonical message hub  --->  SMS
      SMS      --->  canonical message hub  --->  PWA/App
      Email    --->  canonical message hub  --->  SMS / PWA/App

## Stack

- SvelteKit + TypeScript
- `@sveltejs/adapter-cloudflare`, Cloudflare Workers/Pages runtime
- Cloudflare D1 for canonical relational data
- Cloudflare Queues for async fanout **where it fits cleanly** — direct fanout
  is acceptable for v1 if queue consumers are awkward in the SvelteKit
  structure; document the tradeoff
- `wrangler.jsonc` (not `wrangler.toml`) for Cloudflare config
- Raw SQL or very thin DB helpers — **no heavyweight ORM**
- No Docker

The user prefers **config-as-code**: checked-in migrations, scripts, and
`wrangler.jsonc` over dashboard configuration. Wrangler is already
authenticated.

## v1 scope and non-goals

The first version is a minimal working relay: a canonical `general`
conversation, a SvelteKit PWA that displays/sends messages and polls for new
ones, an inbound Twilio-style SMS webhook, and outbound SMS fanout (stubbed
when Twilio credentials are absent).

**Do not implement in v1** (the data model should leave room for these, but the
code should not): auth/login, public signup, Durable Objects, WebSockets/
realtime, inbound or outbound email, MMS/attachments, multi-household
tenancy, admin dashboard, billing, native mobile app, full Twilio signature
validation (TODO scaffolding only).

When a v1 feature would benefit from one of these later, leave a `TODO:`
comment rather than building it now.

## Coding preferences

- Prefer boring, explicit code over clever abstractions. Keep files small.
- TypeScript types for Cloudflare bindings.
- `crypto.randomUUID()` for IDs; ISO 8601 strings for timestamps.
- Raw SQL or tiny helper functions; validate all request bodies; return clear,
  typed errors.
- Keep transport adapters separate from canonical message logic.
- Do not introduce unnecessary dependencies.
- Add `TODO:` comments where later production hardening is needed.
- Do not commit secrets. Twilio secrets (`TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) go through `wrangler secret put`;
  keep a `.dev.vars.example` checked in.
- Do not claim something works unless it was actually checked (`npm run check`,
  `npm run build`, and any tests).

## ExecPlans

This repo follows the ExecPlan discipline — the requirements for writing and
maintaining execution plans are in [`.agent/PLANS.md`](.agent/PLANS.md). Read
it before authoring or implementing a plan.

The detailed v1 build spec — D1 schema (`people`, `endpoints`, `conversations`,
`participants`, `messages`, `deliveries`), seed data, API routes, fanout
helper, and Cloudflare/Twilio setup — belongs in an ExecPlan under `.agent/`,
not in this file. CLAUDE.md holds durable context and conventions; the plan
holds the step-by-step.

PLANS.md includes a `## User-Asset Durability` section and a Write-Path
Checklist. `messages`, `people`, `endpoints`, `conversations`, `participants`,
and `deliveries` are user-asset record classes — any plan touching their write
paths must follow those invariants. Document the canonical user-asset manifest
in the D1 schema docs once they exist, and link it here.

## Branch naming

Use this format exactly: `<type>/<branch-base>-<tailored-suffix>`

`type`: `feat` · `fix` · `chore` · `refactor` · `docs` · `spike`

Canonical `branch-base` values (the architectural areas of household-hub —
adjust as the structure settles):

- `hub` — canonical message store, conversations, fanout orchestration
- `sms` — SMS transport adapter (inbound webhook, outbound send)
- `email` — email transport adapter (future)
- `pwa` — SvelteKit frontend / UI
- `api` — SvelteKit server route handlers
- `db` — D1 schema, migrations, seed data
- `infra` — `wrangler.jsonc`, Cloudflare config, Queues setup

Rules:

- The branch base must be one of the canonical values above.
- The suffix is lowercase kebab-case (`a-z`, `0-9`, `-`), starting with an
  alphanumeric.
- Use the narrowest correct architectural owner. If a change spans areas,
  choose the primary owner — do not combine bases.
- No spaces, underscores, uppercase, or multiple slashes.
- State the exact proposed branch name before creating it.

Regex (keep the base alternation in sync with the list above):

- `^(feat|fix|chore|refactor|docs|spike)/(hub|sms|email|pwa|api|db|infra)-[a-z0-9]+(?:-[a-z0-9]+)*$`

When on `main` with changes to land, do not pause to ask whether to branch —
announce the chosen name in passing, create it, and proceed. When already on a
non-`main` branch, **do not propose or create a new branch on your own
initiative**; default to staying on the current branch. The user explicitly
decides when to cut a new branch ("let's branch" / "make a new branch"). When
asked for a new branch while on a non-`main` branch, return to `main` first
(`git switch main && git pull --ff-only`), then branch from `main`. Do not
stack feature branches on other feature branches.

When asked for a branch name, return: proposed name, type, canonical base,
suffix, and a one-sentence rationale for why that base is the primary owner.

## Build and verification workflow

- Start in the repository root.
- `npm run check` — `svelte-kit sync` + `svelte-check`. The typecheck gate.
- `npm run build` — production build. Must pass before pushing.
- `npm run db:migrate:local` / `db:migrate:remote` — apply D1 migrations.
- `npm run db:seed:local` / `db:seed:remote` — load `seed.sql`.
- Run any tests that exist before pushing a code change.
- Cloudflare D1 changes go through checked-in migration files in `migrations/`,
  never ad-hoc `wrangler d1 execute` against remote. Apply to `--local` first,
  then `--remote`.

## Committing and pushing

Handoff is **make changes → run gates → commit → push**, in one turn without
waiting for permission at each step.

- When a change on a non-`main` feature branch is complete and gates are green
  (`npm run check`, `npm run build`, tests), commit and push it — do not wait
  to be asked.
- Stage only the files relevant to the change (`git add <paths>`), never
  `git add -A` / `git add .`.
- Push in the same turn as the commit (`git push`, or `git push -u origin
  <branch>` for a new branch).
- Never push to `main` directly; never force-push a shared branch without an
  explicit request.
- If a pre-commit/pre-push hook fails, fix the cause and make a new commit — do
  not bypass with `--no-verify`.
- Do **not** auto-commit-and-push when: gates are red; the user said "don't
  commit yet"; the change is on `main`; or the work is genuinely incomplete.

## Pull requests and CI

- After pushing a feature branch, open a PR against `main` if none exists
  (`gh pr create`) and monitor CI to completion.
- Poll `gh pr checks <num>` with `Bash` until every required check is `pass`,
  `skipping`, or `fail` (no `pending`/`queued`).
- If a check fails, surface the failing job's name and log link before deciding
  next steps; do not silently retry.
- Only merge once every required check is green AND the user has authorized it.
