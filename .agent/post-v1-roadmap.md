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
- [ ] **M12 — SMS go-live.** (completed: carrier-registration compliance
  pages — a privacy policy and SMS messaging terms hosted at `/privacy`,
  linked from the app; remaining: set the Twilio secrets, migration 0003 to
  replace the placeholder phone numbers with real ones, and first-message
  opt-out language — all pending a verified number and credentials.)
- [ ] **M13 — Message delivery receipts.** The conversation view shows, under
  each message the current sender authored, how many recipients it reached —
  surfacing the `deliveries` data the relay already records.
- [ ] **M14 — Load-older pagination.** `GET …/messages?before=<timestamp>`
  returns the page of messages older than the cursor; the conversation view
  gets a "Load older messages" button that prepends them with the scroll
  position kept stable.
- [ ] **M15 — Per-sender colours.** Each household member gets a stable colour
  from their id — a coloured initial avatar and a tinted name on every
  message — so the conversation is visually scannable by sender.
- [ ] **M16 — Message search.** `GET …/messages?q=<term>` matches message
  bodies; the conversation header gets a search box that shows matching
  messages with a results banner and a Clear button.
- [ ] **M17 — SMS delivery-status callbacks.** `POST /api/webhooks/sms-status`
  receives Twilio status callbacks and updates the matching `deliveries` row,
  so a receipt reflects the real carrier outcome (`delivered` / `failed`), not
  just "handed to Twilio".
- [ ] **M18 — Create conversations from the UI.** `POST /api/conversations`
  creates a conversation and adds every household member as a participant
  atomically; the conversation tab bar gets a `+` button to create one.
- [ ] **M19 — Installable PWA.** A web app manifest, an SVG icon,
  theme-colour and Apple meta tags, and a minimal service worker that caches
  the built app shell — so household-hub can be installed to a home screen.
- [ ] **M20 — Date separators.** The message list shows a "Today" /
  "Yesterday" / date divider between messages from different calendar days.
- [ ] **M21 — Dark mode.** Theme colours move to CSS custom properties; the app
  follows `prefers-color-scheme` and offers an Auto/Light/Dark toggle that
  persists in `localStorage`.
- [ ] **M22 — Message soft-deletion.** A `deleted_at` column lets a member
  retract their own message; the canonical row is kept, read paths blank the
  body and show a "Message deleted" tombstone, and the SSE stream propagates
  the retraction to every open client.
- [ ] **M23 — Unread conversation indicators.** `GET /api/conversations`
  reports each thread's latest message time; the conversation tab bar shows an
  unread dot on any thread with activity newer than the device last viewed it,
  with the last-viewed time kept per conversation in `localStorage`.
- [ ] **M24 — Message editing.** An `edited_at` column lets a member correct a
  message they sent; the canonical body is replaced in place, the app shows an
  "(edited)" marker, and the SSE stream propagates the edit to every open
  client. A deleted message cannot be edited.
- [ ] **M25 — Clickable links in messages.** URLs in a message body render as
  clickable links that open in a new tab; the body is split into safe text and
  link segments — no raw HTML — so no message can inject markup.
- [ ] **M26 — Per-conversation draft persistence.** An unsent message is kept
  per conversation in `localStorage`, so switching threads or reloading the
  page no longer loses what was typed.
- [ ] **M27 — Conversation rename & archive.** `PATCH /api/conversations/[slug]`
  renames a conversation and archives it (a soft, reversible state); the tab
  bar keeps archived threads hidden behind a reveal toggle and gains a Manage
  panel for the active thread.
- [ ] **M28 — Desktop notifications for new messages.** With the member's
  permission, a browser notification fires when a message from someone else
  arrives while the tab is in the background.
- [ ] **M29 — Jump-to-latest button.** New messages no longer yank the reader
  down while they are scrolled up reading history; a floating "↓ Latest"
  button appears instead and returns them to the newest message on click.
- [ ] **M30 — Export conversation transcript.** `GET …/export` returns the
  whole conversation as a plain-text file download; the Manage panel gets an
  Export link.
- [ ] **M31 — End-to-end test harness.** A Playwright lane drives the real
  SvelteKit stack on `wrangler pages dev` over a local D1 — covering the
  message/conversation API, the webhook authentication gates, and the
  conversation UI — backed by a gated test-only `/api/test/reset` route, and
  wired into CI.
- [ ] **M32 — Unit-test the message-format helpers.** The pure presentation
  helpers (`linkify`, `personHue`, `initial`, `dayKey`, `dayLabel`) move out of
  `+page.svelte` into `$lib/message-format.ts` and gain a unit-test suite.
- [ ] **M33 — Standalone SMS Terms of Service page.** A dedicated `/sms-terms`
  page describes the SMS program (types, frequency, cost, HELP/STOP, opt-in);
  `/privacy` becomes privacy-only and cross-links it. Clears the A2P 10DLC
  "Terms and Conditions" campaign rejection, whose root cause was the Terms of
  Service field pointing at the privacy URL.
- [ ] **M34 — SMS opt-in consent page.** A `/sms-opt-in` form records each
  household member's explicit, documented consent to receive texts into a new
  `sms_consents` table. Clears the A2P 10DLC "Opt-in information" campaign
  rejection, whose root cause was a verbal-only consent narrative with no
  verifiable opt-in mechanism.
- [ ] **M35 — A2P campaign compliance pass.** Cross-checks the household-hub
  campaign against Twilio's A2P 10DLC onboarding guide and error 30896,
  corrects the `/sms-terms` carrier-liability wording, and adds
  `.agent/a2p-campaign.md` — the exact, field-by-field model campaign to enter
  on resubmission.
- [ ] **M36 — Message reactions.** Household members can react to a message
  with one of a fixed emoji set; reactions are tallied per message, toggle on
  and off, and propagate to every open client over the SSE stream.

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

- M11 (2026-05-16): the inbound-email bridge is built and deployed. The
  `household-hub-email` Email Worker is live, the `EMAIL_WEBHOOK_SECRET`
  shared secret is set on both it and the Pages project, and migration 0002
  put the real household email endpoints into local and remote D1. Verified
  in production: `POST /api/webhooks/email` returns 403 without the secret
  header, 403 with a wrong one, and 200 with the correct one. A lesson worth
  keeping: Cloudflare Pages binds secrets at deploy time, so a
  `wrangler pages secret put` must be followed by a redeploy to take effect.
  The one remaining step is the operator's: adding Email Routing
  custom-address rules (`general@`, `groceries@`) that point at the Worker.

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

**M12 — SMS go-live.** SMS is a required transport, so the relay must clear
carrier registration (A2P 10DLC or toll-free verification). M12's first,
credential-independent part is the compliance content: `src/routes/privacy/+page.svelte`
serves a complete privacy policy and SMS messaging terms at `/privacy`,
linked from the app, so registration has a real public URL. The privacy
policy carries the clause carrier reviewers require — that mobile and
SMS-opt-in data is never sold or shared with third parties. The remaining
parts wait on a verified number and credentials: setting `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` as Pages secrets (then a
redeploy — secrets bind at deploy time); migration 0003 replacing the
placeholder `+1555…` endpoint numbers with the household's real mobile
numbers; and a first-message opt-out line so live SMS matches the
registration attestation.

This first part touches no user-asset write path — `/privacy` is a static
page — so it carries no User-Asset Write-Path Checklist; migration 0003 (a
seed-only `endpoints` change, as in 0002) will carry one when it lands.

**M13 — Message delivery receipts.** The relay records a `deliveries` row per
recipient endpoint per message, but the web app never showed it. M13 surfaces
it: the messages API — both `GET /api/conversations/[slug]/messages` and the
SSE stream — include per-message delivery counts (`delivery_total`,
`delivery_ok` for `sent` / `sent_stubbed` / `delivered`, and `delivery_failed`)
via correlated subqueries over `deliveries`; the `POST` returns the same counts
after fanout so the sender's own message shows a receipt immediately.
`+page.svelte` renders a small receipt under each message the current sender
authored — `✓ sent to N`, `sending… (k/N)`, or a failed count. Read-only — no
user-asset write path — so no Write-Path Checklist.

**M14 — Load-older pagination.** The messages list only ever held the most
recent page; older history was unreachable. `GET /api/conversations/[slug]/messages`
now accepts an optional `?before=<ISO timestamp>` cursor — with it, the query
adds `AND m.created_at < ?` and returns the 200 messages immediately older
than the cursor (without it, the most recent 200, unchanged). The SSE stream
still carries the recent backlog and live messages; older history is fetched
on demand. `+page.svelte` shows a "Load older messages" button above the list
that fetches with the oldest loaded message's timestamp as the cursor,
prepends the de-duplicated results, and adjusts `scrollTop` so the viewport
stays put. Read-only — no Write-Path Checklist.

**M15 — Per-sender colours.** Purely a `+page.svelte` change. A `personHue(id)`
helper hashes a person's id to a stable hue (0–359); each message's metadata
row gains a small coloured circle with the sender's initial, and the sender's
name is tinted to the same hue. No API, database, or write path is touched.

**M16 — Message search.** `GET /api/conversations/[slug]/messages` accepts
`?q=<term>` — the query adds `AND m.body LIKE ?` with a bound `%term%`
parameter (no injection) and returns matching messages; `?q=` takes precedence
over `?before=`. `+page.svelte` adds a search box in the header: submitting
fetches matches into a `searchResults` array and switches the message list
into search mode, with a results banner and a Clear button; clearing the
search or switching conversation returns to the live view. Read-only — no
Write-Path Checklist.

**M17 — SMS delivery-status callbacks.** `sendSms` now includes a
`StatusCallback` URL (built from the `PUBLIC_APP_URL` var) when it posts to
Twilio; Twilio then POSTs delivery-status updates to
`POST /api/webhooks/sms-status`. That endpoint verifies the Twilio signature
(when an auth token is set), maps the Twilio `MessageStatus` to a
household-hub status via `mapTwilioStatus` (`delivered`, `failed`, or `sent`),
and updates the `deliveries` row keyed by `provider_message_id` (the Twilio
SID stored at send time). The M13 receipts then show the real carrier
outcome instead of just "handed to Twilio".

User-Asset Write-Path Checklist (M17): the touched class is `deliveries`. The
write path is the new typed helper `updateDeliveryByProviderId` in `db.ts` —
the sole place this UPDATE is issued. The server gate is the status webhook,
which verifies the Twilio request signature and requires `MessageSid` and
`MessageStatus`. `mapTwilioStatus`'s output set is declared in one function
and exercised by `sms.test.ts`. No new try/catch around a user-asset write is
introduced — the single UPDATE is awaited directly; a failure 500s and Twilio
retries.

**M18 — Create conversations from the UI.** Conversations and participants
were seed-only; M18 makes them runtime-creatable. `POST /api/conversations`
validates a `{ name, slug }` body (slug: lowercase alphanumeric + hyphens,
unique — 409 on collision), then creates the conversation and adds every
current household member as a participant. `+page.svelte` adds a `+` button to
the conversation tab bar that opens an inline name field; on create it
switches to the new conversation. The web app derives the slug from the name.

User-Asset Write-Path Checklist (M18): the touched classes are `conversations`
and `participants` — their first runtime write path. The write path is the
single typed helper `createConversationWithParticipants` in `db.ts`, which
runs the conversation INSERT and the participant INSERTs in one `db.batch()`
transaction — so a conversation can never exist with a partial participant
set, which is why no per-iteration try/catch is needed (the batch is
all-or-nothing). The server gate is the `POST` handler: it validates the name
and the slug shape and rejects a duplicate slug (409). No silent fallback —
a batch failure throws and the route returns 500.

**M19 — Installable PWA.** The app was named a PWA but was never installable.
M19 adds `static/manifest.webmanifest` (name, `standalone` display,
theme/background colours), `static/icon.svg` (a household-hub mark), the
`<link rel="manifest">` / `theme-color` / Apple meta tags in `app.html`, and
`src/service-worker.ts` — a deliberately narrow service worker that caches
only the built shell (`build` + `files`) and leaves pages, `/api/*`, and the
SSE stream entirely to the network, so an installed copy never shows stale
data. No API, database, or write path is touched.

**M20 — Date separators.** Purely a `+page.svelte` change. `dayKey` groups
messages by calendar day and `dayLabel` renders divider text (Today /
Yesterday / weekday + date); the message-list `{#each}` emits a `.day-divider`
before the first message of each new day. Applies to both the live view and
search results. No API, database, or write path is touched.

**M21 — Dark mode.** A presentation-only change — no API, database, or write
path is touched. The colour palette is lifted out of component CSS into
`:root` custom properties defined in `app.html`: a light palette under
`:root`, and a dark palette applied two ways — `@media (prefers-color-scheme:
dark) :root:not([data-theme='light'])` for the Auto default, and an explicit
`:root[data-theme='dark']` for the manual override. A tiny inline `<script>`
in `<head>` reads `localStorage['hh-theme']` and sets `documentElement.dataset
.theme` before first paint, so a saved Light/Dark choice causes no flash.
`+page.svelte` and `privacy/+page.svelte` swap every hardcoded hex for a
`var(--…)` reference; `+page.svelte` adds a titlebar theme toggle that cycles
Auto → Light → Dark, calls `applyTheme()`, and writes the choice back to
`localStorage`.

**M22 — Message soft-deletion.** A household member can retract a message they
sent. Deletion is a soft state, never a `DELETE`: migration
`0003_message_soft_delete.sql` adds a nullable `deleted_at` column to
`messages` (NULL = live). The write path is the typed helper
`softDeleteMessage` in `db.ts`, whose `UPDATE … WHERE id = ? AND
author_person_id = ? AND deleted_at IS NULL` both scopes the write to the
author and makes a repeat delete a no-op. A new route
`DELETE /api/conversations/[slug]/messages/[id]` takes `{ personId }`, 404s an
unknown message, 403s a non-author, then calls the helper and returns an
idempotent result. Read paths blank the body of a deleted message in SQL
(`CASE WHEN deleted_at IS NOT NULL THEN ''`) and expose `deleted_at`: the
messages list and the SSE stream both do this, and `?q=` search excludes
deleted messages entirely. The stream's de-dup map is keyed id → deletion
marker, so a retraction re-emits the row to every open client (within the
recent-100 window — older retractions show on reload). `+page.svelte` upserts
streamed messages by id, renders a "Message deleted" tombstone, and gives the
author a small Delete button. `scripts/probe-d1.mjs` gains a `messages` probe:
zero rows with `deleted_at` earlier than `created_at`.

User-Asset Write-Path Checklist (M22): the touched class is `messages`. The
write path is the single typed helper `softDeleteMessage` in
`src/lib/server/db.ts`; the server gate is the `DELETE` handler in
`src/routes/api/conversations/[slug]/messages/[id]/+server.ts`, which validates
the `personId` body, requires the message to exist in the conversation (404),
and requires the caller to be the author (403) before any write. No new string
set is introduced, so no parity test is needed. The post-deploy probe for the
new state is the `messages — deleted_at earlier than created_at` query added to
`scripts/probe-d1.mjs`, run by the existing probe lane against the deployed
database. A real-auth round-trip was exercised against `wrangler pages dev`
(403 for a non-author, 200 for the author, idempotent repeat, body blanked,
search miss) — recorded under Outcomes. No new try/catch wraps the write: the
`DELETE` handler lets a failed write throw to a 500 (no silent fallback), and
`softDeleteMessage` is a single statement with no loop.

**M23 — Unread conversation indicators.** A read-only feature — no API write
path, no migration, no user-asset write, so no Write-Path Checklist. The
`GET /api/conversations` handler gains a `last_message_at` column: a correlated
`SELECT max(m.created_at) … WHERE m.conversation_id = c.id AND m.deleted_at IS
NULL` so the timestamp reflects the latest *readable* message (a retracted
message does not mark a thread unread). `+page.svelte` keeps a per-conversation
last-viewed timestamp in `localStorage` under `hh-read-<slug>`, mirrored into a
`$state` map for reactivity; a conversation tab shows an unread dot when its
`last_message_at` is newer than the stored value and it is not the active
thread. The active conversation is stamped read on selection and again each
time a new message streams in, so it never shows its own dot. The conversation
list is re-fetched on a modest interval (so other threads' activity surfaces
without opening them), reusing the existing `loadConversations()`.

**M24 — Message editing.** A household member can correct a message they sent.
Migration `0004_message_editing.sql` adds a nullable `edited_at` column to
`messages` (NULL = never edited). The write path is the typed helper
`editMessage` in `db.ts`, whose `UPDATE … SET body = ?, edited_at = ? WHERE
id = ? AND author_person_id = ? AND deleted_at IS NULL` scopes the write to
the author and refuses to edit a retracted message. The route gains a
`PATCH /api/conversations/[slug]/messages/[id]` handler taking
`{ personId, body }`: 404 for an unknown message, 403 for a non-author, 409
for a deleted message, 400 for an empty body. Read paths (the messages list
and the SSE stream) expose `edited_at`; the stream's de-dup marker becomes
`<deleted_at>|<edited_at>` so an edit re-emits the row to every open client.
`+page.svelte` adds an inline editor (an Edit button beside Delete opens a
textarea with Save/Cancel) and shows an "(edited)" marker next to the
timestamp. `scripts/probe-d1.mjs` gains a `messages` probe: zero rows with
`edited_at` earlier than `created_at`. Editing affects only the canonical
record and the app — copies already fanned out over SMS/email are unaffected,
the same accepted tradeoff as M22.

User-Asset Write-Path Checklist (M24): the touched class is `messages`. The
write path is the single typed helper `editMessage` in `src/lib/server/db.ts`;
the server gate is the `PATCH` handler in
`src/routes/api/conversations/[slug]/messages/[id]/+server.ts`, which validates
the `{ personId, body }` shape, requires the message to exist in the
conversation (404), requires the caller to be the author (403), and refuses a
deleted message (409). No new string set is introduced, so no parity test is
needed. The post-deploy probe for the new state is the `messages — edited_at
earlier than created_at` query added to `scripts/probe-d1.mjs`. A real-auth
round-trip was exercised against `wrangler pages dev` (403 non-author, 409 on
a deleted message, 200 author edit, `edited_at` set, body replaced) — recorded
under Outcomes. No new try/catch wraps the write: the `PATCH` handler lets a
failed write throw to a 500 (no silent fallback), and `editMessage` is a
single statement with no loop.

**M25 — Clickable links in messages.** Purely a `+page.svelte` change — no API,
database, or write path is touched, so no Write-Path Checklist. A `linkify`
helper splits a message body into an array of `text` and `link` segments using
a URL regex (`https?://…` and bare `www.…`), trimming trailing sentence
punctuation off a matched URL. The message body `{#each}`-renders the segments:
a `text` segment is bound as a text node and a `link` segment as an `<a>` with
its `href`/text bound as attributes/text — never `{@html}` — so a message body
can never inject markup. Links open in a new tab with `rel="noopener
noreferrer"`. `white-space: pre-wrap` on `.body` still preserves newlines
because each text segment keeps its literal whitespace.

**M26 — Per-conversation draft persistence.** Purely a `+page.svelte` change —
no API, database, or write path is touched, so no Write-Path Checklist.
`saveDraft(slug)` writes the composer's current text to `localStorage` under
`hh-draft-<slug>` (or removes the key when the draft is empty); `loadDraft(slug)`
reads it back. The composer input persists on every `oninput`, so closing the
tab mid-sentence loses nothing; `selectConversation` loads the target thread's
draft on switch; `onMount` loads the initial thread's draft; a successful send
clears both the in-memory draft and the stored key.

**M27 — Conversation rename & archive.** A conversation could be created (M18)
but never renamed or tidied away. Migration `0005_conversation_archive.sql`
adds a nullable `archived_at` column to `conversations` (NULL = active).
Renaming is a plain update of the existing `name` column. The write path is
the typed helper `updateConversation` in `db.ts`, which builds a dynamic
`UPDATE` from a `{ name?, archived? }` patch (`archived: true` stamps
`archived_at`, `archived: false` clears it — archiving is soft and reversible).
A new route `PATCH /api/conversations/[slug]` validates the patch (400 on a
blank name, a non-boolean `archived`, or an empty body), 404s an unknown slug,
then applies it. `GET /api/conversations` now also returns `archived_at`.
`+page.svelte` splits conversations into active and archived derived lists: the
tab bar shows active threads, a Manage button opens an inline rename/archive
panel for the active thread, and an `Archived (n)` toggle reveals archived
tabs (dashed, italic). Archiving the thread on screen switches to another
active one. `scripts/probe-d1.mjs` gains a `conversations` probe: zero rows
with `archived_at` earlier than `created_at`.

User-Asset Write-Path Checklist (M27): the touched class is `conversations`.
The write path is the single typed helper `updateConversation` in
`src/lib/server/db.ts`; the server gate is the `PATCH` handler in
`src/routes/api/conversations/[slug]/+server.ts`, which validates the
`{ name?, archived? }` shape, rejects a blank name or non-boolean `archived`
(400), requires at least one field (400), and requires the conversation to
exist (404). No new string set is introduced, so no parity test is needed. The
post-deploy probe for the new state is the `conversations — archived_at
earlier than created_at` query added to `scripts/probe-d1.mjs`. A real-auth
round-trip was exercised against `wrangler pages dev` (rename, archive,
unarchive, 400 on empty body / blank name, 404 on an unknown slug) — recorded
under Outcomes. No new try/catch wraps the write: the `PATCH` handler lets a
failed write throw to a 500 (no silent fallback), and `updateConversation`
issues one statement with no loop.

**M28 — Desktop notifications for new messages.** Purely a `+page.svelte`
change — no API, database, or write path is touched, so no Write-Path
Checklist. A 🔔 titlebar button, shown only while the browser
`Notification.permission` is `default`, calls `Notification.requestPermission()`
from that user gesture. `openStream` records `streamOpenedAt`; when a streamed
message is genuinely new (`created_at` after `streamOpenedAt`), is not from the
active sender, arrives while `document.hidden`, and permission is `granted`,
the page fires a `Notification` titled with the conversation and showing a
short body; clicking it focuses the window. Backlog messages replayed on
connect are older than `streamOpenedAt`, so reconnecting never re-notifies.
The whole feature is guarded by `typeof Notification !== 'undefined'` so it is
inert where the API is unavailable.

**M29 — Jump-to-latest button.** Purely a `+page.svelte` change — no API,
database, or write path is touched, so no Write-Path Checklist. An `onscroll`
handler on the message list maintains an `atBottom` flag (true when the
scrollport is within ~80px of the end). `addMessage` captures `atBottom`
*before* appending and only auto-scrolls to the newest message if the reader
was already at the bottom — a new message no longer yanks someone reading
history downward. While `atBottom` is false a floating "↓ Latest" button
(sticky at the bottom of the list) is shown; clicking it smooth-scrolls to the
newest message.

**M30 — Export conversation transcript.** A read-only feature — no write path,
so no Write-Path Checklist. A new route `GET /api/conversations/[slug]/export`
reads every message in the conversation (oldest-first), formats each as
`[ISO time] Author (transport): body`, and returns the result as a
`text/plain` response with a `Content-Disposition: attachment` filename so the
browser downloads it. A soft-deleted message becomes a `[deleted]` line and an
edited one is suffixed `(edited)` — the transcript stays honest without
exposing retracted text. `+page.svelte` adds an Export link (a download
anchor) to the conversation Manage panel.

**M31 — End-to-end test harness.** The repo had 41 unit tests over the pure
server helpers but nothing exercised the API routes, the webhook auth gates,
or the UI. M31 adds a Playwright lane: `playwright.config.ts` (testDir `e2e/`,
one worker, Chromium) with a `webServer` that runs `scripts/e2e/start-server
.mjs` — which builds, applies the D1 migrations to the local database, and
starts `wrangler pages dev` with two test-only bindings. `e2e/` holds five
specs — `api-messages`, `api-message-mutations`, `api-conversations`,
`api-webhook-auth`, and a `ui-smoke` browser test — covering message
post/read/search, the soft-delete and edit author gates, conversation
create/rename/archive/export, the inbound-email shared-secret gate, inbound
SMS, and the conversation page itself. A gated test-only route
`POST /api/test/reset` wipes D1 and re-inserts a fixed seed fixture so each
test starts clean. `package.json` gains `test:e2e`, and `ci.yml` gains an
`e2e` job that installs Chromium and runs the lane. Vitest already scopes
itself to `src/**/*.test.ts`, so it does not collect the Playwright `.spec.ts`
files. Twilio credentials are deliberately not bound to the E2E server, so the
SMS adapter stays stubbed and the inbound-SMS webhook accepts unsigned
requests — no paid provider call is ever made by the suite.

User-Asset Write-Path Checklist (M31): the touched classes are all six —
`people`, `endpoints`, `conversations`, `participants`, `messages`,
`deliveries` — because the `/api/test/reset` route `DELETE`s and re-`INSERT`s
every one of them. This is acceptable only because the route is provably
unreachable in production: it 404s on the production hostname
(`household-hub.pages.dev`), and 404s whenever the `TEST_ROUTES_SECRET`
binding is absent — which it always is on production Pages, since that binding
is set only by `scripts/e2e/start-server.mjs`. A wrong `x-test-secret` header
yields 403. The gate is the route handler itself in
`src/routes/api/test/reset/+server.ts`; its 403-on-wrong-secret behaviour is
asserted by `e2e/api-webhook-auth.spec.ts`, and its correct operation is
exercised by every spec's `beforeEach`. No new string set is introduced, so no
parity test is needed; the existing post-deploy probes still cover all six
classes (the route adds no new record class). No new try/catch wraps the
write: the reset runs as one atomic `db.batch()`, and a failure throws to a
500 (no silent fallback).

**M32 — Unit-test the message-format helpers.** A test-only refactor — no API,
database, or write path is touched, so no Write-Path Checklist. The pure
presentation helpers that lived inside `+page.svelte` (`linkify`, `personHue`,
`initial`, `dayKey`, `dayLabel`) move verbatim into a new `$lib/message-format
.ts` module; `+page.svelte` imports them instead of defining them inline.
`dayLabel` gains an optional `now` parameter (default `new Date()`) so its
Today/Yesterday branches are deterministically testable. `src/lib/message-
format.test.ts` adds 17 unit cases — URL segmenting and punctuation trimming,
stable per-person hues, avatar initials, and calendar-day grouping. The
day-grouping fixtures are built with the local-time `Date` constructor so the
assertions hold regardless of the test runner's timezone (an early version
keyed on `Z`-literal timestamps that straddled local midnight).

**M33 — Standalone SMS Terms of Service page.** Presentation only — no API,
database, or write path is touched, so no Write-Path Checklist. The A2P 10DLC
campaign was rejected for a "Terms and Conditions" issue: the campaign's Terms
of Service field pointed at `/privacy`, the same URL as the Privacy Policy
field, and reviewers require a *distinct* Terms of Service page. M33 adds a
dedicated `/sms-terms` route describing the SMS program — program name,
message types and frequency, cost ("Message and data rates may apply"), how to
opt in (forward-referencing the `/sms-opt-in` form built in M34), HELP and
STOP, carrier-liability, and a support contact. `/privacy` is retitled
"Privacy Policy", drops its trailing "SMS Messaging Terms" definition list
(now redundant), updates its consent description to reference the opt-in form
instead of the verbal/in-person narrative that contributed to the second
rejection, and cross-links `/sms-terms`. The home-page footer links both
pages, and `e2e/ui-smoke.spec.ts` gains a check that `/sms-terms` loads.

**M34 — SMS opt-in consent page.** The A2P 10DLC campaign's second rejection
banner was "Opt-in information": consent was described as verbal/in-person
with no opt-in keywords and no opt-in form, so the reviewer had no verifiable
evidence of consent. M34 adds the verifiable mechanism. Migration
`0006_sms_consents.sql` creates an `sms_consents` table (`id`, `name`,
`phone`, `consented_at`). A new `/sms-opt-in` page carries the required
disclosure language and a form — name, mobile number, and an explicit consent
checkbox — that POSTs to `POST /api/sms-consent`. The route validates the
payload and records one row; that row, and the public form itself, are the
documented consent the reviewer needs (the household administrator gives them
the URL and a screenshot). `/sms-terms` and `/privacy` already forward-link
`/sms-opt-in`. `scripts/probe-d1.mjs` gains an `sms_consents` probe; the
`/api/test/reset` route also wipes the new table; `e2e/api-sms-consent.spec.ts`
covers the route's validation and the page's happy path.

User-Asset Write-Path Checklist (M34): the touched class is the new
`sms_consents` table. The write path is the single typed helper
`insertSmsConsent` in `src/lib/server/db.ts`; the server gate is the `POST`
handler in `src/routes/api/sms-consent/+server.ts`, which requires a non-empty
name, a phone with 10–15 digits, and `agreed === true` (the server enforces
the consent checkbox, so a consent row can never exist without explicit
agreement). No new string set is introduced, so no parity test is needed. The
post-deploy probe for the class is the `sms_consents — blank name or phone`
query added to `scripts/probe-d1.mjs`; `e2e/api-sms-consent.spec.ts` is the
real-auth round-trip (valid 201, missing/false `agreed` 400, blank name 400,
short phone 400, plus the page flow). No new try/catch wraps the write —
`insertSmsConsent` is one statement and a failure throws to a 500 (no silent
fallback).

**M35 — A2P campaign compliance pass.** No API, database, or write path is
touched, so no Write-Path Checklist. The household-hub campaign was
cross-checked field-by-field against Twilio's A2P 10DLC Campaign Onboarding
Guide and the actual rejection error 30896 (Opt-in Error). One app fix: the
`/sms-terms` carrier-liability sentence is corrected to the guide's verbatim
wording, "Carriers are not liable for any delayed or undelivered messages."
The rest of the work is `.agent/a2p-campaign.md` — a checked-in reference
holding the exact, copy-paste-ready content for every campaign registration
field (use case, description, message flow with all three URLs spelled out as
error 30896 requires, sample messages with `[Name]` placeholders, and
brand-named opt-in confirmation / opt-out / HELP messages with the frequency
and rate disclosures the guide requires), plus a table of what changed since
the rejected submission. The privacy policy already carried the non-sharing
statement, frequency, and rate disclosures, so it needed no change.

**M36 — Message reactions.** Household members can react to a message with an
emoji. Migration `0007_reactions.sql` creates a `reactions` table — one row
per `(message_id, person_id, emoji)`, with a UNIQUE constraint that keeps a
reaction idempotent. `src/lib/reactions.ts` is the single source of truth for
the accepted emoji set (`REACTION_EMOJI`) and exports `isReactionEmoji`; the
`emoji` column is deliberately free text with no CHECK, so there is no schema
copy of the set to drift. The write path is `toggleReaction` in `db.ts` (adds
the row, or removes it if the person already holds that emoji);
`loadReactions` aggregates a set of messages into per-emoji `{emoji, count,
people}` summaries. A new route
`POST /api/conversations/[slug]/messages/[id]/reactions` validates the
`{personId, emoji}` body, requires the message and the person to exist, then
toggles. The messages list and the SSE stream attach `reactions` to each
message; the stream's change marker gains a reaction signature so a reaction
re-emits the message to every open client. `+page.svelte` shows reaction
chips under each message (highlighted when the active sender reacted) and a
`+` picker; toggling is optimistic and reconciled by the stream.
`scripts/probe-d1.mjs` gains a `reactions` probe, the `/api/test/reset` route
wipes the table, and `e2e/api-reactions.spec.ts` plus `reactions.test.ts`
cover the route and the emoji-set validator.

User-Asset Write-Path Checklist (M36): the touched class is the new
`reactions` table. The write path is the single typed helper `toggleReaction`
in `src/lib/server/db.ts`; the server gate is the `POST` handler in
`src/routes/api/conversations/[slug]/messages/[id]/reactions/+server.ts`,
which requires a known `personId`, an `emoji` accepted by `isReactionEmoji`,
and an existing message in the conversation. The accepted emoji set is the
single declaration `REACTION_EMOJI` in `src/lib/reactions.ts`, imported by
both the client picker and the server validator — invariant 3 is satisfied
with no schema duplication. `src/lib/reactions.test.ts` enumerates
`REACTION_EMOJI` and asserts `isReactionEmoji` accepts every entry and rejects
others — the parity test required by invariant 3. The post-deploy probe is
`reactions — dangling message_id / person_id` in `scripts/probe-d1.mjs`;
`e2e/api-reactions.spec.ts` is the real-auth round-trip (toggle on/off, tally,
400 on a bad emoji, 400 on an unknown person, 404 on an unknown message). No
new try/catch wraps the write — `toggleReaction` issues one statement per
branch and a failure throws to a 500 (no silent fallback).

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
