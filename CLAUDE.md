# Claude Code Project Instructions

> **STUB — needs tailoring.** This file was seeded from the PracticePartner
> CLAUDE.md and genericized for Comms (a Svelte/Node web app). Sections marked
> `TODO:` must be filled in once the project structure exists — especially the
> canonical branch bases, the test scripts, and any deploy/data sections.

## Branch naming

When proposing, creating, or validating branch names for this repository, use
this format exactly:

- `<type>/<branch-base>-<tailored-suffix>`

Allowed `type` values:

- `feat`
- `fix`
- `chore`
- `refactor`
- `docs`
- `spike`

Allowed canonical `branch-base` values:

> TODO: Replace these placeholders with the real architectural areas of Comms
> once the structure is settled. In PracticePartner these were tier-0 elements
> (runtime work topology) and experiences (user-facing surfaces). Pick the set
> that matches Comms.

- `app`
- `ui`
- `api`
- `auth`
- `data`
- `infra`

Rules:

- The actual branch base must be one of the canonical values above.
- The tailored suffix must be lowercase kebab-case (`a-z`, `0-9`, `-` only).
- The suffix must begin with an alphanumeric character.
- Use the narrowest correct architectural owner as the branch base.
- If a change spans multiple areas, choose the primary owner rather than
  combining multiple bases.
- Do not invent alternate branch formats: no spaces, underscores, uppercase
  letters, or multiple slashes.
- Do not create a branch until you have first stated the exact proposed branch
  name.

Required regex (update the base alternation to match the canonical list above):

- `^(feat|fix|chore|refactor|docs|spike)/(app|ui|api|auth|data|infra)-[a-z0-9]+(?:-[a-z0-9]+)*$`

When the working tree is on `main` and there are changes to land, do not pause
to ask whether to create a branch. Announce the chosen name in passing — for
visibility, so the user can course-correct — then create it and proceed.

When the working tree is already on a non-`main` branch, **do not suggest,
propose, or create a new branch on your own initiative** — even if the next
change feels topically unrelated. Default to staying on the current branch and
adding the work there. The user explicitly decides when it is time to cut a new
branch. Phrases like "let's branch" or "make a new branch" from the user are
the only valid trigger. When the user asks for a new branch while you are on a
non-`main` branch, return to `main` first (`git switch main && git pull
--ff-only`), then create the new branch from `main`. Do not stack feature
branches on top of other feature branches.

When the user asks for a branch name, return:

- proposed branch name
- selected type
- selected canonical branch base
- selected suffix
- one-sentence rationale for why that base is the primary owner

## Node and test workflow

> TODO: These scripts do not exist yet. Add them to `package.json` and adjust
> the commands here once the toolchain is in place.

- Start in the repository root.
- Use `npm run test:unit` for unit tests (Vitest).
- Use `npm run test:e2e` for end-to-end tests (Playwright).
- Do not use `npx vitest` or raw `playwright test` directly unless intentionally
  debugging the underlying command.
- **Run `npm run test:e2e` before pushing whenever a change touches code**
  (`.ts`, `.svelte`, `.css`, route files, or anything affecting the rendered
  DOM or runtime behavior). Type-checking and unit tests cover correctness in
  isolation; E2E covers surface contracts (CSS class names, page structure,
  navigation, click paths) that no other gate catches.

## Committing and pushing

This repo uses a **make changes → run gates → commit → push** handoff, done in
one turn without waiting for permission at each step.

- When you finish a change on a non-`main` feature branch and the relevant
  gates are green (typecheck, unit tests, and E2E when the change touches
  code), commit the work and push it — do not wait to be asked.
- Stage only the files relevant to the change (`git add <paths>`), not
  `git add -A` / `git add .`.
- After creating a commit, push it in the same turn (`git push`, or
  `git push -u origin <branch>` for a brand-new branch).
- Never push to `main` directly, and never force-push a shared branch without
  an explicit request.
- If a pre-commit or pre-push hook fails, fix the underlying issue and create a
  new commit; do not bypass with `--no-verify`.
- Do *not* auto-commit-and-push when: gates are red; the user said "don't
  commit yet" / "let me review first"; the change is on `main`; or the work is
  genuinely incomplete.

## Pull requests and CI

- After pushing a feature branch, open a PR against `main` if one does not
  already exist (`gh pr create ...`) and monitor CI to completion. A remote
  branch without a PR is invisible to reviewers and CI gating.
- Poll `gh pr checks <num>` with `Bash` until every required check is `pass`,
  `skipping`, or `fail` (no `pending`/`queued`).
- If a check fails, surface the failing job's name and log link to the user
  before deciding next steps; do not silently retry.
- Only merge once every required check is green AND the user has authorized the
  merge.

## ExecPlans

This repo follows the ExecPlan discipline. The requirements for writing and
maintaining execution plans live in [`.agent/PLANS.md`](.agent/PLANS.md). Read
that file before authoring or implementing an ExecPlan.

> TODO: PLANS.md includes `## User-Asset Durability` invariants and a
> Write-Path Checklist that assume a persistent datastore with a documented
> user-asset manifest. Once Comms has a data layer, document the canonical
> user-asset record list (e.g. in a `cloudflare/d1/README.md` or equivalent)
> and link it here. If Comms never persists user data, trim those sections
> from PLANS.md.

## Repository discipline

- Keep repo-level guardrails simple and explicit.
- Prefer deterministic enforcement for Git and branch policy.

> TODO: Document the architectural model of record for Comms (its elements and
> surfaces) once it exists, and keep this file in sync with it.
