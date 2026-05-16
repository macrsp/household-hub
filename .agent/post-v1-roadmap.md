# household-hub post-v1 roadmap: deploy, harden, extend

This ExecPlan is a living document. `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` are kept current as work
proceeds. Maintained in accordance with [`.agent/PLANS.md`](PLANS.md).

It is a **multi-milestone roadmap**: rather than a fresh ExecPlan per change,
new post-v1 work is added here as a milestone. The v1 build itself is a
separate, completed plan — [`.agent/household-relay-v1.md`](household-relay-v1.md).

## Purpose / Big Picture

household-hub v1 — a household communication relay where the app owns one
canonical conversation and SMS / app are transport adapters — is built and
merged (PRs #1–#8). This roadmap takes it from "built and locally tested" to
"running in production, hardened, and extended": a live Cloudflare Pages
deployment, a CI safety net, the production-durability probes PLANS.md
requires, security hardening of the SMS webhook, and then the features the v1
data model was deliberately shaped to allow (multiple conversations,
notification preferences, email, realtime).

Each milestone is independently shippable as its own branch + PR and leaves
the app working. Milestones M1–M5 are operational hardening; M6–M10 are
features. M6–M10 are sketched here and must be fleshed out into full,
self-contained milestone specs (with a User-Asset Write-Path Checklist where
they touch `messages` / `endpoints` / `participants` / `deliveries` writes)
when each is reached.

## Progress

- [x] (2026-05-16) **M1 — Deploy v1 to Cloudflare Pages.** Remote D1
  `household-hub-db` created, migrated, and seeded; Pages project
  `household-hub` created; `wrangler.jsonc` gained `compatibility_flags:
  ["nodejs_compat"]` after the first deploy warned about `node:async_hooks`;
  redeployed to production. Verified live: `https://household-hub.pages.dev/api/health`
  → `{"ok":true}` HTTP 200, `/` → 200, `/api/people` → the three seeded
  members (remote D1 binding confirmed).
- [x] (2026-05-16) **M2 — CI pipeline.** `.github/workflows/ci.yml` runs
  `npm ci`, `npm run check`, `npm run build`, `npm run test:unit` on Node 24
  for every pull request and every push to `main`. PRs now carry a required
  status check; its first run is on the M2 PR itself.
- [x] (2026-05-16) **M3 — Post-deploy data probes.** `scripts/probe-d1.mjs`
  runs the six per-table invariant queries from `migrations/README.md`
  (`npm run probe:local` / `probe:remote`); verified against production D1 —
  all 6 invariants hold. `.github/workflows/probe.yml` runs them daily and on
  demand. The CI workflow is **dormant** until a `CLOUDFLARE_API_TOKEN`
  repository secret is added (a deliberate operator decision — a no-expiration
  account-wide token in CI was not auto-stored); it skips with a notice until
  then. PLANS.md User-Asset Durability invariant 4.
- [ ] **M4 — Twilio request-signature validation.** Replace the `TODO` in the
  SMS webhook with real `X-Twilio-Signature` HMAC-SHA1 verification against
  `TWILIO_AUTH_TOKEN`.
- [ ] **M5 — CSRF hardening.** Resolve the deprecated `kit.csrf.checkOrigin =
  false`: determine the inbound webhook's real cross-origin shape and move to
  the narrowest correct `kit.csrf.trustedOrigins` configuration.
- [ ] **M6 — Multiple conversations.** Inbound-SMS routing to a conversation
  other than `general`, and a conversation switcher in the PWA. (Feature —
  flesh out when reached; touches `messages` writes.)
- [ ] **M7 — Notification preferences.** Honor `participants.delivery_preference`
  and `participants.muted` in fanout, with a small UI to set them. (Feature —
  touches `participants` writes.)
- [ ] **M8 — Outbound email transport adapter.** Deliver fanout to `email`
  endpoints via an email-sending API. (Feature — touches `deliveries` writes.)
- [ ] **M9 — Inbound email.** Email → canonical message, via stable
  per-conversation addresses. (Feature — touches `messages` / `endpoints`
  writes.)
- [ ] **M10 — Realtime delivery.** Replace the 3-second poll with server push
  (Server-Sent Events or a Durable Object).

## Surprises & Discoveries

- Observation: the first `wrangler pages deploy` warned `node:async_hooks` is
  unavailable without the `nodejs_compat` compatibility flag — SvelteKit's
  server runtime imports it, so the Worker would throw at runtime.
  Evidence: deploy output — `enable the "nodejs_compat" compatibility flag ...
  Imported from @sveltejs/kit/src/exports/internal/event.js`.
  Resolution: added `compatibility_flags: ["nodejs_compat"]` to
  `wrangler.jsonc` and redeployed; the warning is gone and the live app works.

- Observation: `wrangler pages deploy` tags the deployment by the current git
  branch — deploying from a feature branch produces a *preview* deployment,
  not production. `--branch main` forces a production deployment regardless of
  the checked-out branch.
  Evidence: a deploy from `chore/infra-nodejs-compat` produced the alias
  `chore-infra-nodejs-compat.household-hub.pages.dev`, not the production
  `household-hub.pages.dev`.

## Decision Log

- Decision: deploy as a Cloudflare Pages project (not a standalone Worker).
  Rationale: consistent with `wrangler.jsonc` (`pages_build_output_dir`) and
  the v1 ExecPlan; the `CLOUDFLARE_API_TOKEN` carries Pages Read/Write.
  Date/Author: 2026-05-16 / M1.

- Decision: add `compatibility_flags: ["nodejs_compat"]`.
  Rationale: SvelteKit's server bundle imports `node:async_hooks`; without the
  flag the deployed Worker throws at runtime. Standard for SvelteKit on
  Cloudflare.
  Date/Author: 2026-05-16 / M1.

- Decision: this roadmap is one living, multi-milestone ExecPlan; future
  post-v1 work is added as a milestone here rather than as a new file.
  Rationale: the operator asked for multi-milestone plans so a new ExecPlan is
  not written for every change.
  Date/Author: 2026-05-16 / roadmap author.

## Outcomes & Retrospective

- M1 (2026-05-16): household-hub v1 is live at `https://household-hub.pages.dev`,
  backed by remote Cloudflare D1, with `nodejs_compat` enabled. Health, the
  root page, and the D1-backed `/api/people` route all verified in production.
  Remaining roadmap: M2–M10.

## Context and Orientation

household-hub is a SvelteKit + `@sveltejs/adapter-cloudflare` app deployed as
the Cloudflare Pages project `household-hub`. `wrangler.jsonc` at the repo
root configures the Pages project, the D1 binding `DB` → `household-hub-db`
(id `e0e4439e-7bf6-4e53-bccc-b0bb1e855cfb`), and `compatibility_flags`. The
Cloudflare API token is at `~/.config/household-hub/cf-token` (mode 600), read
by `wrangler` from `CLOUDFLARE_API_TOKEN`. Build output: `.svelte-kit/cloudflare`.
The repository conventions (branch naming, gates, commit/PR flow) are in
[`CLAUDE.md`](../CLAUDE.md); the v1 build and its User-Asset Write-Path
Checklist are in `.agent/household-relay-v1.md`.

## Plan of Work

**M1 — Deploy (done).** `wrangler.jsonc` gains `compatibility_flags:
["nodejs_compat"]`. Build, `wrangler pages deploy ... --branch main`, verify
the live health/page/D1 routes.

**M2 — CI pipeline.** Add `.github/workflows/ci.yml`: on `pull_request` and
`push` to `main`, run `npm ci`, `npm run check`, `npm run build`, `npm run
test:unit` on Node 24. After it merges, PRs gain real status checks; the
commit/PR workflow in `CLAUDE.md` (poll `gh pr checks`) becomes meaningful.

**M3 — Post-deploy data probes.** Add a script (`scripts/probe-d1.mjs` or a
SQL file) holding the six per-table invariant queries already written out in
`migrations/README.md`, each asserting a count is zero. Add a CI job (or a
documented manual step) that runs them against the deployed D1 after a deploy.

**M4 — Twilio signature validation.** In `src/routes/api/webhooks/sms/+server.ts`,
replace the `TODO` with real validation: recompute the Twilio signature
(HMAC-SHA1 of the full URL + sorted POST params, keyed by `TWILIO_AUTH_TOKEN`,
base64) and compare to the `X-Twilio-Signature` header; reject mismatches with
`403`. Make it skip only when `TWILIO_AUTH_TOKEN` is absent (local/dev), and
unit-test the signing function against a known vector.

**M5 — CSRF hardening.** Establish what `Origin` (if any) Twilio's webhook
sends, then move from the deprecated `kit.csrf.checkOrigin = false` to the
narrowest correct `kit.csrf.trustedOrigins`, keeping the webhook reachable.

**M6–M10 — features.** Sketched in `Progress`; each is fleshed out into a full
milestone spec (purpose, files, steps, acceptance, and a User-Asset Write-Path
Checklist where it writes user-asset records) when it is reached.

## Concrete Steps

Per milestone, on its own branch following `CLAUDE.md` branch naming, run the
gates (`npm run check`, `npm run build`, `npm run test:unit`), commit, push,
open a PR, and merge once green. M1's steps:

    export CLOUDFLARE_API_TOKEN=$(cat ~/.config/household-hub/cf-token)
    npm run build
    npx wrangler pages deploy .svelte-kit/cloudflare --project-name household-hub --branch main
    curl -s https://household-hub.pages.dev/api/health   # -> {"ok":true}

## Validation and Acceptance

- M1: `https://household-hub.pages.dev/api/health` → 200 `{"ok":true}`; `/` →
  200; `/api/people` → the seeded members. (All verified 2026-05-16.)
- M2: a PR shows the CI workflow running and passing `check` / `build` /
  `test:unit`.
- M3: the probe script exits non-zero if any invariant query returns a
  non-zero count; it exits zero against the seeded database.
- M4: a webhook POST with a wrong/absent signature (when `TWILIO_AUTH_TOKEN`
  is set) is rejected `403`; a correctly-signed one is accepted.
- M5: `npm run check` no longer prints the `csrf.checkOrigin` deprecation, and
  the inbound webhook still accepts a simulated Twilio POST.
- M6–M10: acceptance defined when each milestone is fleshed out.

## Idempotence and Recovery

`wrangler pages deploy` is idempotent — each run is a new immutable deployment.
Remote D1 migrations are tracked in `d1_migrations`; `seed.sql` is `INSERT OR
IGNORE`. Each milestone is a separate PR, so any milestone can be reverted
without unwinding the others.

## Artifacts and Notes

M1 production verification (2026-05-16):

    $ curl -s https://household-hub.pages.dev/api/health
    {"ok":true}
    $ curl -s https://household-hub.pages.dev/api/people   # -> Matt, Person Three, Person Two
