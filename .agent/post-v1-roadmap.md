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
- [x] (2026-05-16) **M4 — Twilio request-signature validation.**
  `verifyTwilioSignature` in `src/lib/server/sms.ts` recomputes Twilio's
  HMAC-SHA1 signature (URL + sorted params) and constant-time-compares it to
  `X-Twilio-Signature`. The SMS webhook rejects a bad or absent signature with
  `403` when `TWILIO_AUTH_TOKEN` is set, and skips validation when it is
  absent (local/dev). `src/lib/server/sms.test.ts` pins the algorithm against
  a cross-checked vector. Verified: 20 unit tests pass; webhook still
  `200`/`403` with no token configured.
- [x] (2026-05-16) **M5 — CSRF hardening.** Investigated SvelteKit's CSRF
  check (`@sveltejs/kit` `respond.js`): it forbids any form-content-type POST
  whose `Origin` is absent or unmatched, and `trustedOrigins` only whitelists
  *present* origins. The Twilio webhook sends no `Origin`, so `trustedOrigins`
  cannot admit it — `checkOrigin: false` is the only working setting and must
  stay. `svelte.config.js` and `README.md` now document this definitively so
  the deprecation is not naively "fixed" in a way that breaks the webhook.
- [x] (2026-05-16) **M6 — Multiple conversations.** `seed.sql` adds a
  `groceries` conversation; `src/lib/server/routing.ts` parses a `#slug `
  prefix; the SMS webhook routes a prefixed message to that conversation when
  the sender participates (else `general`, message intact); `+page.svelte`
  has a conversation-tab switcher. Verified by curl: `#groceries need milk` →
  groceries thread (prefix stripped); plain SMS → general; `#nosuchconv` →
  general with the text intact. 26 unit tests pass (6 new routing tests).
- [x] (2026-05-16) **M7 — Notification preferences.** `src/lib/preferences.ts`
  declares the `delivery_preference` set (`all`, `app_only`); `fanout.ts`
  skips SMS for `app_only` recipients (`muted` was already honored);
  `GET`/`PUT /api/conversations/[slug]/participants/[personId]` reads and
  updates a participant's `muted` / `delivery_preference`; `+page.svelte` adds
  a mute toggle and delivery selector for the active sender. Verified by curl:
  an `app_only` recipient received no `deliveries` row; a bad
  `delivery_preference` → 400. 30 unit tests pass.
- [x] (2026-05-16) **M8 — Outbound email transport adapter.**
  `src/lib/server/email.ts` — `sendEmail()`, the email counterpart of
  `sms.ts`: posts to the Resend REST API when `RESEND_API_KEY` + `EMAIL_FROM`
  are set, stubs otherwise. `fanout.ts` now delivers to `email` endpoints as
  well as `sms`. `seed.sql` adds an example `email` endpoint. Verified by
  curl: a recipient with both sms and email endpoints received one
  `deliveries` row per transport (both `sent_stubbed`). 33 unit tests pass.
- [x] (2026-05-16) **M9 — Inbound email.** `POST /api/webhooks/email` ingests
  an inbound email JSON payload — maps the `from` address to a household
  member, routes by the `to` address's local part to a conversation
  (`conversationSlugFromEmailAddress` in `routing.ts`, plus-addressing
  stripped), stores a `source_transport='email'` message, and fans out.
  `README.md` documents the Cloudflare Email Routing → Email Worker glue.
  Verified by curl: routed to groceries / general by the to-address; unknown
  sender → 403. 38 unit tests pass (5 new routing tests).
- [x] (2026-05-16) **M10 — Realtime delivery.** `GET /api/conversations/[slug]/stream`
  is a Server-Sent Events endpoint — it emits the recent backlog on connect,
  then each new message as it appears, with heartbeat comments on idle ticks.
  `+page.svelte` replaced its 3-second `setInterval` poll with one
  `EventSource` per conversation (sent messages added optimistically; the
  stream's echo de-dupes by id). Verified by curl: a message POSTed after the
  stream connected was pushed to it within ~1.5s. 38 unit tests pass.
- [x] (2026-05-16) **M11 — Inbound email bridge Worker + webhook secret.**
  `email-worker/` is a deployable Cloudflare Email Worker that MIME-parses
  routed mail (`postal-mime`) and forwards `{from,to,body}` to
  `POST /api/webhooks/email` with an `X-Webhook-Secret` header; the webhook
  rejects a missing/wrong secret with 403 when `EMAIL_WEBHOOK_SECRET` is set,
  skips the check when unset. `seed.sql` now seeds the real email endpoints
  (north0401@gmail.com → Matt, macrsp@gmail.com → Person Two). Verified by
  curl: no/wrong secret → 403, correct secret → 200; the email-worker builds
  (`wrangler deploy --dry-run`). 38 unit tests pass.

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

- Observation: changing `wrangler.jsonc`'s `database_id` repoints local D1.
  `wrangler ... --local` and `wrangler pages dev` key their local SQLite state
  by the configured database, so after the placeholder id became the real id
  the local database was a fresh, empty one — the webhook 500'd with `no such
  table: endpoints` until `db:migrate:local` + `db:seed:local` were re-run.
  Evidence: `D1_ERROR: no such table: endpoints` during M4 local verification.

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

- Decision (M5): keep `kit.csrf.checkOrigin = false`; do not migrate to
  `trustedOrigins`.
  Rationale: SvelteKit's CSRF check (`respond.js`) forbids a form-content-type
  POST when `request_origin !== url.origin && (!request_origin ||
  !trustedOrigins.includes(request_origin))`. A request with no `Origin`
  header always fails. Twilio's webhook is a server-to-server POST with no
  `Origin`, so no `trustedOrigins` value admits it. Disabling the check is
  required; it does not weaken the app (its own writes are `application/json`,
  never CSRF-checked) and the webhook is protected by Twilio signature
  validation (M4). If upstream removes `checkOrigin`, the webhook moves to a
  dedicated non-SvelteKit Worker route.
  Date/Author: 2026-05-16 / M5.

## Outcomes & Retrospective

- M1 (2026-05-16): household-hub v1 is live at `https://household-hub.pages.dev`,
  backed by remote Cloudflare D1, with `nodejs_compat` enabled. Health, the
  root page, and the D1-backed `/api/people` route all verified in production.

- Roadmap complete (2026-05-16): M1–M10 all merged. Operational hardening —
  CI (M2), post-deploy data probes (M3), Twilio signature validation (M4),
  CSRF decision (M5) — and the features the v1 data model was shaped for:
  multiple conversations (M6), notification preferences (M7), the outbound
  (M8) and inbound (M9) email transport adapters, and realtime delivery over
  Server-Sent Events (M10). Each landed as its own PR with green CI; the
  unit-test suite grew from 0 to 38. Two user-side activations remain
  optional: adding the `CLOUDFLARE_API_TOKEN` repository secret arms the M3
  probe workflow, and configuring Cloudflare Email Routing arms M9's inbound
  path. Real outbound SMS (Twilio) and email (Resend) remain stubbed until
  their credentials are set — the adapters and the stub paths are exercised,
  the live provider calls are not. Natural next work beyond this roadmap:
  exercising the live Twilio/Resend paths once credentials exist, and (if the
  household outgrows a 1.5 s server-side poll) swapping M10's poll loop for a
  Durable Object — the SSE endpoint is already the seam for it.

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

**M6 — Multiple conversations.** The schema already supports many
conversations (`conversations`, `participants`); v1 seeds and assumes only
`general`. M6 makes the relay genuinely multi-conversation:

- `seed.sql` gains a second conversation, `groceries`, with all three people
  as participants — so there is a thread to switch to.
- `src/lib/server/routing.ts` adds `parseConversationPrefix(body)`: an inbound
  SMS whose body begins with `#<slug> ` names a target conversation; the
  prefix is routing metadata and is stripped from the stored message body.
- `POST /api/webhooks/sms` routes via that prefix — to the named conversation
  when it exists and the sender participates in it, otherwise to `general`
  (an unrecognised prefix never loses a message).
- `src/routes/+page.svelte` gains a conversation switcher: it loads
  `/api/conversations`, shows a selector, and reads/sends/polls against the
  active conversation. The per-slug API routes already exist (M2), so no API
  change is needed.

User-Asset Write-Path Checklist (M6): the only user-asset write path touched
is `messages` — the webhook still inserts exactly one message per inbound SMS
via `insertMessage` (`src/lib/server/db.ts`); M6 only changes which
`conversation_id` it carries. The gate is unchanged: `conversation_id` is
resolved from a `conversations` row that must exist, and the existing
`messages` `CHECK`/typed-insert still apply. `seed.sql` adds `conversations`
and `participants` rows (seed-only write path, as in v1). A unit test in
`src/lib/server/routing.test.ts` covers `parseConversationPrefix`. No new
try/catch around a user-asset write is introduced.

**M7 — Notification preferences.** `src/lib/preferences.ts` declares the
`delivery_preference` set (`all`, `app_only`) as one source of truth for the
server validator and the web UI. `fanout.ts` carries each recipient's
`delivery_preference` and skips SMS for `app_only` (`muted` was already
honored). `GET`/`PUT /api/conversations/[slug]/participants/[personId]` reads
and updates a participant's `muted` / `delivery_preference` through the typed
`updateParticipantPrefs` helper; `+page.svelte` shows a mute toggle and a
delivery selector for the active sender.

User-Asset Write-Path Checklist (M7): the touched user-asset class is
`participants`. The write path is `updateParticipantPrefs` in
`src/lib/server/db.ts`; the server gate is the `PUT` handler in
`.../participants/[personId]/+server.ts`, which rejects a non-boolean `muted`
and any `delivery_preference` outside the declared set via `isDeliveryPreference`.
The declared set lives once in `src/lib/preferences.ts`, enumerated by
`src/lib/preferences.test.ts`. No new try/catch around a user-asset write is
introduced.

**M8 — Outbound email transport adapter.** `src/lib/server/email.ts` —
`sendEmail()`, the email counterpart of `sms.ts`: posts to the Resend REST API
when `RESEND_API_KEY` and `EMAIL_FROM` are set, stubs otherwise. `fanout.ts`
delivers to `email` endpoints as well as `sms` (still skipping `app` endpoints
and `app_only` recipients), writing one `deliveries` row per endpoint with the
correct `transport`. `seed.sql` adds an example `email` endpoint; `app.d.ts`
and `.dev.vars.example` carry the two new secrets.

User-Asset Write-Path Checklist (M8): the touched class is `deliveries`. The
write path is unchanged — the same `insertDelivery` / `updateDeliveryStatus`
helpers in `db.ts`; M8 only uses `email`, an existing member of
`DELIVERY_TRANSPORTS` and the schema `CHECK`. The per-iteration try/catch is
unchanged (one catch around each send, recording the outcome on the delivery
row). `email.test.ts` covers the stub path. No new try/catch is introduced.

**M9 — Inbound email.** `POST /api/webhooks/email` accepts an inbound email as
a JSON payload (`{ from, to, body }`) — the inbound counterpart of the SMS
webhook. It maps `from` to a household member via an `email` endpoint, routes
by the `to` address's local part (`conversationSlugFromEmailAddress` in
`routing.ts`), stores a `source_transport='email'` message, and fans out.
Cloudflare Email Routing cannot POST to HTTP directly, so `README.md`
documents a small Email Worker that forwards the parsed message here.

User-Asset Write-Path Checklist (M9): the touched class is `messages`. The
write path is the existing `insertMessage` helper; `source_transport='email'`
is an existing `SOURCE_TRANSPORTS` / schema-`CHECK` value. The server gate is
the webhook handler — unknown sender → 403, empty body → 400.
`routing.test.ts` covers `conversationSlugFromEmailAddress`. The one try/catch
around the `fanoutMessage` call is the established webhook-fanout pattern (as
in the SMS webhook): the message write has already succeeded, so logging a
fanout failure is not a silent fallback on a user-asset write.

**M10 — Realtime delivery.** `GET /api/conversations/[slug]/stream` is a
Server-Sent Events endpoint: a `ReadableStream` that emits the recent backlog
on connect, then polls D1 every 1.5 s server-side and emits each not-yet-sent
message as an SSE `data:` event, with `: ping` heartbeats on idle ticks; the
stream's `cancel` handler stops the loop when the client disconnects.
`+page.svelte` replaces its `setInterval` poll with one `EventSource` per
conversation — a sent message is shown optimistically and the stream's echo
de-dupes by id.

This keeps a short server-side D1 poll rather than a Durable Object — the
roadmap sketch allowed either, and for a household it is the right size. The
SSE endpoint is a clean seam: swapping the poll loop for a Durable Object
subscription later needs no client change.

This milestone touches no user-asset write path (the stream is read-only), so
it carries no User-Asset Write-Path Checklist.

**M11 — Inbound email bridge Worker + webhook secret.** M9 built the
inbound-email webhook but Cloudflare Email Routing cannot POST to HTTP
directly. M11 adds `email-worker/` — a separate, deployable Cloudflare Email
Worker that receives routed mail, MIME-parses it with `postal-mime`, and
forwards a clean `{ from, to, body }` payload to `POST /api/webhooks/email`
with an `X-Webhook-Secret` header. The webhook gains a secret check: when
`EMAIL_WEBHOOK_SECRET` is set it requires the header to match (403 otherwise),
and skips the check when unset (local/dev) — the same pattern as the Twilio
signature on the SMS webhook. `seed.sql` replaces the placeholder `email`
endpoints with the real household addresses. The Worker is deployed and the
shared secret set on both the Pages project and the Worker; the operator adds
the Email Routing custom-address rules (`general@`, `groceries@`) pointing at
the Worker.

User-Asset Write-Path Checklist (M11): the touched user-asset class is
`endpoints`, and only via `seed.sql` (the seed-only write path, as in v1 —
real addresses replace placeholders). The email webhook's `messages` write
path is unchanged from M9 (`insertMessage`). M11 adds one server gate — the
`EMAIL_WEBHOOK_SECRET` header check — which only rejects requests; it does not
touch a write. No new try/catch around a user-asset write is introduced.

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
