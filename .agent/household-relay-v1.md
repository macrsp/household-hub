# Build the Household Hub v1 Relay

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository checks in `.agent/PLANS.md` at the repository root. This document must be authored and maintained in accordance with `.agent/PLANS.md` — read that file before implementing or revising this plan.

## Purpose / Big Picture

`household-hub` lets the members of one household talk to each other in a single shared conversation even though they each prefer a different channel. One person uses a web page on their phone; another only reads and sends text messages (SMS); a third may later use email. Today there is no such tool here — the repository contains only project scaffolding (`CLAUDE.md`, `.agent/PLANS.md`, `.gitignore`, `.claude/`). After this plan is implemented, a household member can open a web page, pick their name, type a message, and send it; a different member who only uses SMS receives that same message as a text; and when the SMS user texts back, their reply appears on the web page. The conversation is one shared thread, not a pile of disconnected text messages.

The single most important idea, repeated here because the rest of the plan depends on it: **the application owns the canonical conversation; SMS, email, and the web app are only transport adapters.** A "canonical conversation" means the authoritative, complete history of messages lives in one place — a database table called `messages` — and every channel is just a way of getting a message into that table or delivering a copy out of it. A "transport adapter" means a small, isolated piece of code whose only job is to translate between one external channel (for example, Twilio's SMS API) and the canonical store. We do not treat the stream of text messages as the source of truth, and we do not try to make carriers' native group-SMS behavior do our job. Every inbound message — whether it arrived from the web app, from an SMS webhook, or later from email — becomes one row in `messages`, and then a "fanout" step delivers a copy to every other participant through whichever channel that participant prefers.

You can see it working at the end: with the development server running, loading `http://localhost:8788/` shows the `general` conversation; sending a message from the page stores it and (when SMS credentials are configured) texts the other members; POSTing a simulated Twilio webhook with `curl` injects an SMS-origin message that then appears on the page within the 3-second poll interval.

## Progress

- [x] (2026-05-16) ExecPlan authored from the v1 build specification and `.agent/PLANS.md`.
- [x] (2026-05-16) Milestone 1 — SvelteKit + Cloudflare scaffold, D1 schema, seed data, health route. `npm run check` clean (0 errors, 0 warnings), `npm run build` green via `@sveltejs/adapter-cloudflare`, local D1 migrated + seeded (people 3, endpoints 3, conversations 1, participants 3), `GET /api/health` returns `{"ok":true}` with HTTP 200.
- [x] (2026-05-16) Milestone 2 — Canonical message store and the app-transport read/write API. `GET /api/people`, `GET /api/conversations`, `GET /api/conversations/[slug]/messages` (oldest-first, author name joined), and `POST .../messages` (validates body + author, stores `source_transport='app'`). Verified by curl: valid POST → 201; empty body and unknown author → 400; unknown conversation → 404; posted message returned by GET with `author_name`.
- [x] (2026-05-16) Milestone 3 — Fanout helper and the outbound SMS adapter (stubbed without Twilio credentials). `src/lib/server/sms.ts` (`sendSms`, stub when secrets absent), `src/lib/server/fanout.ts` (`fanoutMessage`, author + muted skipped, per-iteration try/catch), wired into the app POST route. 16 unit tests pass (transport-set ⇄ schema parity, SMS stub mode). Verified by curl: POST as Matt → exactly 2 `deliveries` rows (Person Two, Person Three — author skipped), both `sent_stubbed`.
- [x] (2026-05-16) Milestone 4 — Inbound SMS webhook. `POST /api/webhooks/sms` accepts a Twilio-style form post, maps `From` to a household member, stores the message with `source_transport='sms'`, fans out, and returns empty TwiML. Verified by curl: known sender → 200 + `<Response></Response>`; unknown sender → 403 plain-text, nothing written; missing fields → 400; the SMS message appears in the GET thread as `[sms]` and fanned out to 2 recipients.
- [ ] Milestone 5 — The PWA front-end page.
- [ ] Final verification — `npm run check`, `npm run build`, seed + curl acceptance transcript, README complete.

Use timestamps on every entry as work proceeds, and split any partially complete item into a "done" part and a "remaining" part rather than leaving it ambiguous.

## Surprises & Discoveries

- Observation: `wrangler` cannot authenticate to Cloudflare non-interactively in this environment — the cached OAuth token expired and the automatic refresh failed.
  Evidence: `npx wrangler d1 create household-hub-db` →
      ✘ [ERROR] Failed to fetch auth token: 400 Bad Request
      ✘ [ERROR] In a non-interactive environment, it's necessary to set a
        CLOUDFLARE_API_TOKEN environment variable for wrangler to work.
  Implication: every *remote* Cloudflare operation (`d1 create`, `d1 migrations apply --remote`, `pages deploy`) needs `CLOUDFLARE_API_TOKEN`. See the Decision Log.

- Observation: local D1 operations need no Cloudflare auth and no real `database_id`. `wrangler d1 migrations apply --local` and `wrangler d1 execute --local` run against a SQLite file under `.wrangler/state/` and accept the all-zero placeholder UUID in `wrangler.jsonc`.
  Evidence: `npm run db:migrate:local` → `0001_initial.sql ✅ 8 commands executed`; per-table `SELECT count(*)` → people 3, endpoints 3, conversations 1, participants 3, messages 0, deliveries 0.

- Observation: SvelteKit's built-in CSRF protection blocks the Twilio webhook. SvelteKit rejects any cross-origin POST whose content type is `application/x-www-form-urlencoded` / `multipart/form-data` / `text/plain` — exactly the shape of a Twilio inbound-SMS webhook.
  Evidence: the first `POST /api/webhooks/sms` curl returned `Cross-site POST form submissions are forbidden` with HTTP 403, before the route handler ran.
  Resolution: set `kit.csrf.checkOrigin = false` in `svelte.config.js`. The app's own writes use `application/json`, which that check never covered, so they are unaffected; the webhook's real protection is the Twilio signature-validation TODO. Recorded in the Decision Log.

## Decision Log

- Decision: v1 uses **direct (synchronous) fanout**, not Cloudflare Queues.
  Rationale: `.agent/PLANS.md` and `CLAUDE.md` both permit direct fanout for v1 when queue consumers are awkward in the SvelteKit structure. A Cloudflare Queues consumer is a separate Worker entrypoint; wiring that cleanly into a SvelteKit + `adapter-cloudflare` project adds real complexity for a household-scale tool. The fanout logic is written as one isolated, reusable helper (`src/lib/server/fanout.ts`) so that moving it behind a queue later is a localized change. `wrangler.jsonc` keeps a commented-out queue binding and the README records the tradeoff.
  Date/Author: 2026-05-16 / plan author.

- Decision: the v1 validation gate is `npm run check` + `npm run build` + a scripted `curl` acceptance transcript + minimal unit tests for the fanout helper and request validators. v1 does **not** stand up a Playwright end-to-end suite.
  Rationale: `.agent/PLANS.md` contains a generic paragraph mandating `npm run test:e2e` for code-touching milestones, but household-hub's `CLAUDE.md` defines the build gate as `npm run check`, `npm run build`, and "any tests that exist," and v1's scope is explicitly minimal. Standing up an E2E browser harness is deferred. This is a deliberate, recorded deviation; "Outcomes & Retrospective" should note an E2E harness as the first follow-up if the UI grows.
  Date/Author: 2026-05-16 / plan author.

- Decision: SMS sending is **stubbed** (logged, delivery row marked `sent_stubbed`) whenever the three Twilio secrets are absent.
  Rationale: lets the entire relay be developed and demonstrated end-to-end without a paid Twilio account, while keeping the real send path in the same code path behind one `if`.
  Date/Author: 2026-05-16 / plan author.

- Decision: `wrangler.jsonc`'s `d1_databases[0].database_id` holds the all-zero placeholder UUID `00000000-0000-0000-0000-000000000000` until a real Cloudflare database exists.
  Rationale: every milestone's acceptance is local, and `--local` D1 operations ignore `database_id`. Creating the remote database needs Cloudflare auth not available non-interactively (see Surprises). The real id must be pasted in before any remote/deploy work; `wrangler.jsonc` and the README both say so.
  Date/Author: 2026-05-16 / M1 implementer.

- Decision: re-open the earlier "OAuth for now" Cloudflare-auth choice — automated/remote `wrangler` work in this repo needs a `CLOUDFLARE_API_TOKEN`, not OAuth.
  Rationale: OAuth refresh requires an interactive browser flow a non-interactive agent cannot perform. This does not block local development or milestones 1–5's local acceptance, but it does block `wrangler d1 create`, `db:migrate:remote`, and `deploy`. A scoped API token is a prerequisite for the first remote deploy; recorded as a follow-up in the README.
  Date/Author: 2026-05-16 / M1 implementer.

- Decision: v1 fanout writes a `deliveries` row only for `sms` endpoints; `email` and `app` endpoint types are skipped with no row.
  Rationale: v1 has exactly one outbound adapter (SMS). The web app receives messages by polling the GET route, not by a pushed delivery, and email is a v1 non-goal. Writing a row only when a real send is attempted keeps every `deliveries` row meaningful. The v1 seed has only `sms` endpoints, so seeded-data behavior is unaffected; an email adapter later adds its own branch in `fanout.ts`.
  Date/Author: 2026-05-16 / M3 implementer.

- Decision: disable SvelteKit's CSRF origin check globally (`kit.csrf.checkOrigin = false`).
  Rationale: the Twilio inbound-SMS webhook is a cross-origin form-encoded POST that SvelteKit's same-origin check rejects before the handler runs. SvelteKit offers no per-route CSRF setting. The check only ever applied to form-encoded POSTs; household-hub's own writes are `application/json`, so disabling it does not weaken them. The webhook's intended protection is Twilio request-signature validation (a TODO in `webhooks/sms/+server.ts`).
  Date/Author: 2026-05-16 / M4 implementer.

## Outcomes & Retrospective

To be written at the completion of each milestone and at the end of the plan: what now works that did not before, what was left out, and what the next contributor should know. Compare the result against the Purpose section above.

## Context and Orientation

Assume no prior knowledge of this repository. The repository directory is named `Comms`; the application/product name is `household-hub`. Work begins from the repository root, which for this environment is `/home/macrsp/git-repos/Comms`.

The stack, fixed by `CLAUDE.md`:

- **SvelteKit** with **TypeScript**. SvelteKit is a web framework: it produces both the browser page and the server-side request handlers (called "server routes") from one project.
- **`@sveltejs/adapter-cloudflare`** — the adapter that makes a SvelteKit build run on Cloudflare's platform.
- **Cloudflare Workers/Pages runtime** — where the app runs. A "Worker" is Cloudflare's term for a server-side function; "Pages" is Cloudflare's hosting product for sites that also includes Worker functions.
- **Cloudflare D1** — a SQLite-backed relational database that the Worker can query. The app reaches it through a "binding" (a named handle, here `DB`) injected at runtime.
- **`wrangler`** — Cloudflare's command-line tool. It applies database migrations, runs a local dev server, and deploys. It is configured by **`wrangler.jsonc`** (a JSON file that allows comments), never `wrangler.toml`.
- Raw SQL with thin TypeScript helpers — no ORM (no large database-abstraction library). No Docker.

Terms used throughout this plan, defined here once:

- **Canonical message** — a row in the `messages` table; the authoritative copy of something someone said.
- **Transport** / **transport adapter** — a channel (`app`, `sms`, `email`) and the isolated code that bridges it to the canonical store. `app` means the SvelteKit web page; `sms` means Twilio text messages; `email` is future.
- **Endpoint** — a specific address on a transport that belongs to a person: an `app` endpoint, an `sms` phone number, or (future) an `email` address. One person can have several.
- **Participant** — a person who belongs to a given conversation and therefore receives its fanout.
- **Fanout** — the step that, given one new canonical message, delivers a copy to every other participant through each one's endpoints, recording one `deliveries` row per attempt.
- **Delivery** — a row in the `deliveries` table recording one attempt to push one message to one endpoint, with a status.
- **Twilio** — a third-party service that sends and receives SMS. "Twilio-style form post" means an HTTP POST whose body is URL-encoded form fields such as `From` and `Body`; that is the shape Twilio uses for inbound-SMS webhooks.
- **Webhook** — an HTTP endpoint in our app that an external service calls when an event happens (here: an SMS arrived).

Files this plan creates (full repository-relative paths; create directories as needed):

    package.json                 - dependencies and npm scripts
    svelte.config.js              - SvelteKit + adapter-cloudflare config
    vite.config.ts                - Vite bundler config
    tsconfig.json                 - TypeScript config (extends the SvelteKit-generated base)
    wrangler.jsonc                - Cloudflare bindings and config
    .dev.vars.example             - example local secrets file (checked in)
    seed.sql                      - editable seed data
    migrations/0001_initial.sql   - the D1 schema
    migrations/README.md          - schema notes incl. the canonical user-asset manifest
    src/app.d.ts                  - TypeScript types for the Cloudflare platform bindings
    src/app.html                  - SvelteKit HTML shell
    src/lib/server/db.ts          - tiny typed D1 query/insert helpers
    src/lib/server/time.ts        - ISO-8601 timestamp helper
    src/lib/server/fanout.ts      - the reusable fanout helper
    src/lib/server/sms.ts         - the outbound SMS transport adapter
    src/routes/+page.svelte       - the PWA conversation page
    src/routes/+page.server.ts    - initial server-side load for the page (optional)
    src/routes/api/health/+server.ts
    src/routes/api/people/+server.ts
    src/routes/api/conversations/+server.ts
    src/routes/api/conversations/[slug]/messages/+server.ts
    src/routes/api/webhooks/sms/+server.ts
    src/lib/server/fanout.test.ts - unit tests for fanout + validators

Preserve the separation between canonical data access (`db.ts`), fanout (`fanout.ts`), the SMS adapter (`sms.ts`), the SvelteKit route handlers (`+server.ts` files), and the UI (`+page.svelte`). Route handlers validate input and call helpers; helpers never import route code.

## User-Asset Write-Path Checklist

This plan writes to user-asset record classes, so per `.agent/PLANS.md` this section is mandatory.

**1. User-asset record classes written.** All six tables defined by this plan are user-asset record classes: `people`, `endpoints`, `conversations`, `participants`, `messages`, `deliveries`. At v1 runtime, the application writes to `messages` (every inbound message from any transport) and `deliveries` (one row per fanout attempt). The other four — `people`, `endpoints`, `conversations`, `participants` — are written only by `seed.sql` in v1; their runtime write paths (adding a household member, registering an endpoint) are explicit v1 non-goals and must not be built now. The canonical manifest of these six classes is recorded in `migrations/README.md`, created by Milestone 1, and is referenced from `CLAUDE.md`.

**2. Server-side validators / shape gates in scope.** Three layers gate every user-asset write and the plan must keep all three: (a) the SQLite `CHECK` constraints in `migrations/0001_initial.sql` — `endpoints.type`, `messages.source_transport`, and `deliveries.transport` each constrain a string to a fixed set; (b) the typed insert helpers in `src/lib/server/db.ts` (`insertMessage`, `insertDelivery`, `updateDeliveryStatus`) — the only functions permitted to issue `INSERT`/`UPDATE` against user-asset tables; (c) the per-request body validators inside each `+server.ts` POST handler (`src/routes/api/conversations/[slug]/messages/+server.ts` and `src/routes/api/webhooks/sms/+server.ts`), which reject malformed input before any helper is called.

**3. Single declared source of truth for the transport string set.** The accepted transport values (`app`, `sms`, `email`, plus `system` for `messages.source_transport`) are declared once, in `src/lib/server/db.ts`, as exported `const` arrays (`ENDPOINT_TYPES`, `SOURCE_TRANSPORTS`, `DELIVERY_TRANSPORTS`). The route validators and the fanout helper import those constants; they do not re-spell the strings. The schema `CHECK` clauses must be kept textually in sync with those arrays — `migrations/README.md` states this, and `fanout.test.ts` includes a test that enumerates each declared array and asserts a fixture row for each entry is accepted, so adding or renaming a transport without updating every site fails the test run.

**4. New try/catch around user-asset writes.** The fanout helper introduces exactly one try/catch around a user-asset write: the per-recipient, per-endpoint send loop in `src/lib/server/fanout.ts` wraps each individual delivery attempt. This is not a silent fallback. Each iteration first inserts a `deliveries` row with status `pending`; on a send failure the catch updates that same row to status `failed` with the error text, and on success updates it to `sent` or `sent_stubbed`. The `deliveries` table is itself the persistent record of the outcome — a failed delivery is durably visible, not swallowed. The loop uses one try/catch per iteration so that one recipient's failure cannot abort delivery to the remaining recipients (the `.agent/PLANS.md` per-iteration-independence invariant). No try/catch in this plan converts a server rejection into a reported success.

A post-deploy data probe per record class (the fourth `.agent/PLANS.md` durability invariant) cannot run in v1 because v1 has no CI pipeline. `migrations/README.md` records, for each of the six classes, the invariant query that a future post-deploy lane must run (for example, for `messages`: zero rows whose `author_person_id` is absent from `people`; for `deliveries`: zero rows whose `message_id` is absent from `messages`). Wiring those into CI is listed as a follow-up in the README's "what to implement next" section.

## Plan of Work

The work is five milestones, each independently verifiable. Implement them in order; do not start a milestone before the previous one's acceptance check passes. Commit at every stopping point and keep `Progress` current.

The schema is the foundation, so Milestone 1 creates it exactly as specified. The six tables (authoritative definitions — reproduce them verbatim into `migrations/0001_initial.sql`):

    CREATE TABLE people (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE endpoints (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sms', 'email', 'app')),
      address TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(type, address)
    );

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE participants (
      conversation_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      delivery_preference TEXT NOT NULL DEFAULT 'all',
      muted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, person_id)
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      author_person_id TEXT NOT NULL,
      body TEXT NOT NULL,
      source_transport TEXT NOT NULL CHECK (source_transport IN ('app', 'sms', 'email', 'system')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE deliveries (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      endpoint_id TEXT NOT NULL,
      transport TEXT NOT NULL CHECK (transport IN ('sms', 'email', 'app')),
      provider_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

Add an index that the message-list query needs: `CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at);`.

`seed.sql` (separate from migrations; loaded by its own script) creates one conversation with slug `general`, three people (`Matt`, `Person Two`, `Person Three`), one `sms` endpoint per person using obviously fake numbers (for example `+15550000001`, `+15550000002`, `+15550000003`), and three `participants` rows joining all three people to `general`. Keep `seed.sql` short and hand-editable, with a comment at the top explaining how to swap in real names and numbers. Use literal string IDs in the seed (for example `person-matt`, `conv-general`) so the file stays readable and re-runnable; production rows created later use `crypto.randomUUID()`.

**Milestone 1 — Scaffold, schema, seed, health.** Scaffold a SvelteKit + TypeScript project in the repository root, add `@sveltejs/adapter-cloudflare`, and write `wrangler.jsonc` with the `DB` D1 binding and a commented-out queue binding. Write `migrations/0001_initial.sql`, `seed.sql`, `migrations/README.md`, `.dev.vars.example`, the npm scripts, `src/app.d.ts` (typing `platform.env.DB` as `D1Database` plus the optional Twilio secrets), and `src/lib/server/db.ts` and `src/lib/server/time.ts`. Implement `GET /api/health` returning `{ "ok": true }` as JSON. At the end of this milestone the project type-checks, builds, the local D1 database has the schema and seed applied, and the health route answers.

**Milestone 2 — Canonical store and app-transport API.** Implement the read routes `GET /api/people`, `GET /api/conversations`, and `GET /api/conversations/[slug]/messages` (recent messages, ascending by `created_at`, each including the author's `display_name` via a join). Implement `POST /api/conversations/[slug]/messages`: validate that the JSON body has a non-empty string `body` and an `authorPersonId` that exists in `people`, resolve the conversation by `slug`, insert a `messages` row with `source_transport = 'app'` and a `crypto.randomUUID()` id, and return the inserted message. Fanout is not wired yet — leave a clearly marked `// TODO(M3): trigger fanout here`. At the end of this milestone a message sent with `curl` is stored and visibly returned by the GET route.

**Milestone 3 — Fanout helper and outbound SMS.** Implement `src/lib/server/sms.ts` exporting `sendSms(env, to, body)`: if `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are all present, POST to the Twilio REST API and return the provider message id; if any is missing, log the would-send line and return a sentinel indicating a stubbed send. Implement `src/lib/server/fanout.ts` exporting `fanoutMessage(db, env, messageId)`: load the message, its author, the conversation's participants, skip the author and any muted participant, load each remaining participant's endpoints, and for each endpoint insert a `pending` `deliveries` row then attempt the send inside its own try/catch (see the Write-Path Checklist, item 4). For `sms` endpoints the sent text is exactly `[Author Name]: message body`. A successful real send sets status `sent` and stores `provider_message_id`; a stubbed send sets `sent_stubbed`; a failure sets `failed` and stores the error text. Wire the M2 `TODO` so `POST /api/conversations/[slug]/messages` calls `fanoutMessage` after insert. At the end of this milestone, sending a message creates `deliveries` rows and logs stubbed SMS lines (or sends real texts when secrets are set).

**Milestone 4 — Inbound SMS webhook.** Implement `POST /api/webhooks/sms` accepting a URL-encoded form body with `From` and `Body`. Look up an `endpoints` row with `type = 'sms'` and `address` equal to `From`; if none, respond `403` with a clear plain-text message and write nothing. Otherwise resolve the owning person, route the message to the `general` conversation, insert a `messages` row with `source_transport = 'sms'`, call `fanoutMessage`, and respond with an empty TwiML document (`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, content-type `text/xml`) so Twilio is satisfied. Add a `// TODO:` for Twilio request-signature validation — do not implement it. At the end of this milestone a simulated webhook `curl` injects an SMS-origin message that the GET route then returns.

**Milestone 5 — PWA front-end.** Implement `src/routes/+page.svelte`: on load, fetch `/api/people` and `/api/conversations/general/messages`; render the message list (author name, body, time) and a form with a sender `<select>` populated from people, a text input, and a send button that POSTs to `/api/conversations/general/messages`; poll the messages endpoint every 3 seconds and re-render. Keep the styling simple and clean. No authentication, no admin screens. At the end of this milestone the page is a usable household chat surface in the browser.

After Milestone 5, write `README.md` covering: what the project does; v1 limitations; the data-model overview; local setup; Cloudflare setup; Twilio setup; how to test inbound SMS locally with `curl`; how to replace the fake household members in `seed.sql`; how to deploy; and what to implement next (inbound/outbound email, auth, attachments, multiple conversations, realtime, notification preferences, Cloudflare Queues fanout, and the post-deploy data probes from the Write-Path Checklist).

## Concrete Steps

Run everything from the repository root, `/home/macrsp/git-repos/Comms`.

Scaffold SvelteKit (Milestone 1). The current scaffolder is `sv`; accept the minimal TypeScript template into the current directory:

    npx sv create --template minimal --types ts .

If `sv create` refuses because the directory is not empty, scaffold into a temporary subdirectory and move the generated files up, preserving the existing `CLAUDE.md`, `.agent/`, `.claude/`, `.gitignore`, and `migrations/`. Then add the Cloudflare adapter:

    npm install --save-dev @sveltejs/adapter-cloudflare wrangler
    npm install --save-dev vitest

Set `svelte.config.js` to import and use `@sveltejs/adapter-cloudflare`. Add these scripts to `package.json` (adjust the database name only if you choose a different one — this plan uses `household-hub-db`):

    "dev": "vite dev",
    "build": "vite build",
    "preview": "wrangler pages dev .svelte-kit/cloudflare",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test:unit": "vitest run",
    "db:migrate:local": "wrangler d1 migrations apply household-hub-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply household-hub-db --remote",
    "db:seed:local": "wrangler d1 execute household-hub-db --local --file ./seed.sql",
    "db:seed:remote": "wrangler d1 execute household-hub-db --remote --file ./seed.sql",
    "deploy": "wrangler pages deploy .svelte-kit/cloudflare"

Create the local D1 database and apply schema + seed:

    npx wrangler d1 create household-hub-db
    # Copy the printed database_id into wrangler.jsonc's d1_databases entry.
    npm run db:migrate:local
    npm run db:seed:local

Verify the schema landed:

    npx wrangler d1 execute household-hub-db --local --command "SELECT name FROM sqlite_master WHERE type='table';"
    # Expect: people, endpoints, conversations, participants, messages, deliveries (plus sqlite internal + d1_migrations).

Type-check and build after each milestone, and run unit tests once they exist:

    npm run check
    npm run build
    npm run test:unit

Run the app locally with the D1 binding available. `vite dev` alone does not bind D1; use the Wrangler-backed preview, which serves on port 8788 by default:

    npm run build && npm run preview
    # Then exercise the routes against http://localhost:8788

Acceptance commands used by later milestones (expected output shown after `# ->`):

    curl -s http://localhost:8788/api/health
    # -> {"ok":true}

    curl -s http://localhost:8788/api/people
    # -> a JSON array including Matt, Person Two, Person Three

    curl -s -X POST http://localhost:8788/api/conversations/general/messages \
      -H 'content-type: application/json' \
      -d '{"authorPersonId":"person-matt","body":"hello household"}'
    # -> the inserted message as JSON, with an id and created_at

    curl -s http://localhost:8788/api/conversations/general/messages
    # -> a JSON array ending with the "hello household" message, author "Matt"

    curl -s -X POST http://localhost:8788/api/webhooks/sms \
      --data-urlencode 'From=+15550000002' --data-urlencode 'Body=texting in'
    # -> empty <Response></Response> XML; the message then appears in the GET above as author "Person Two"

    curl -s -X POST http://localhost:8788/api/webhooks/sms \
      --data-urlencode 'From=+19999999999' --data-urlencode 'Body=who am i'
    # -> HTTP 403 with a clear "unknown sender" message; nothing written

Keep this section updated with any command that changed in practice (for example, if the preview port differs in this environment, record the actual port and how it was discovered).

## Validation and Acceptance

Acceptance is behavior, not code shape. The plan is complete when all of the following hold, each demonstrable by a reader who starts from only this repository:

- `npm run check` reports no errors and `npm run build` completes.
- `npm run test:unit` passes, including the transport-set enumeration test described in the Write-Path Checklist (item 3): that test fails if a transport string is added to a `db.ts` constant without a matching accepted fixture, and fails if removed.
- With `npm run build && npm run preview` running, the `curl` transcript in "Concrete Steps" reproduces exactly: health returns `{"ok":true}`; an app-posted message is stored and returned with its author's display name; a simulated Twilio webhook from a seeded number injects an SMS-origin message that the GET route then returns; a webhook from an unknown number returns `403` and writes nothing.
- After sending a message, querying the local database shows one `deliveries` row per other participant endpoint:

      npx wrangler d1 execute household-hub-db --local --command "SELECT transport, status FROM deliveries;"
      # -> rows with status 'sent_stubbed' when no Twilio secrets are set

- Opening `http://localhost:8788/` in a browser shows the `general` conversation, lets you pick a sender and send a message, and reflects a message injected by the webhook `curl` within about 3 seconds (the poll interval).
- `README.md` exists and contains all ten required topics listed at the end of "Plan of Work".

The transport-set unit test is the one test that must visibly fail before its protection exists and pass after: write it, watch it fail against an intentionally incomplete validator, fix the validator, watch it pass.

## Idempotence and Recovery

The migration step is idempotent: `wrangler d1 migrations apply` records applied migrations in a `d1_migrations` table and skips them on re-run. Re-running `npm run db:migrate:local` after the schema exists is a safe no-op.

`seed.sql` is not naturally idempotent — re-running plain `INSERT`s against already-seeded rows fails on the primary-key and `UNIQUE` constraints. Write every statement in `seed.sql` as `INSERT OR IGNORE` so `npm run db:seed:local` can be run repeatedly without error; this is also why the seed uses fixed literal IDs. To start completely fresh locally, delete the local D1 state under `.wrangler/` (already git-ignored) and re-run migrate + seed.

If the SvelteKit scaffolder leaves the working tree in a confusing half-state, recover by inspecting `git status`, restoring the four pre-existing committed paths (`CLAUDE.md`, `.agent/`, `.claude/`, `.gitignore`) from `git`, and re-running the scaffold into a clean temporary directory. Commit after each milestone so any milestone can be retried from a known-good point. Never run `wrangler d1 execute` with a destructive statement against `--remote`; remote schema changes go only through checked-in migration files, applied `--local` first.

## Artifacts and Notes

As milestones complete, capture the proof here as short indented transcripts — the `SELECT name FROM sqlite_master` output showing the six tables, the `curl` acceptance run, and the `deliveries` query showing `sent_stubbed` rows. Keep each excerpt to the few lines that prove the milestone, not full logs.

## Interfaces and Dependencies

Dependencies, all already named in `CLAUDE.md`; do not add others without recording the reason in the Decision Log: `@sveltejs/kit`, `svelte`, `@sveltejs/adapter-cloudflare`, `typescript`, `vite`, `wrangler`, and `vitest` for unit tests. No ORM, no HTTP-client library (use the runtime `fetch` for the Twilio call), no Docker.

The following names and signatures must exist at the end of the plan and should be treated as stable contracts.

In `src/lib/server/db.ts`:

    export const ENDPOINT_TYPES = ['sms', 'email', 'app'] as const;
    export const SOURCE_TRANSPORTS = ['app', 'sms', 'email', 'system'] as const;
    export const DELIVERY_TRANSPORTS = ['sms', 'email', 'app'] as const;

    export type EndpointType = typeof ENDPOINT_TYPES[number];
    export type SourceTransport = typeof SOURCE_TRANSPORTS[number];
    export type DeliveryTransport = typeof DELIVERY_TRANSPORTS[number];

    export interface Message {
      id: string; conversation_id: string; author_person_id: string;
      body: string; source_transport: SourceTransport; created_at: string;
    }

    export function insertMessage(db: D1Database, m: Message): Promise<void>;
    export function insertDelivery(db: D1Database, d: DeliveryRow): Promise<void>;
    export function updateDeliveryStatus(
      db: D1Database, id: string, status: string,
      fields?: { provider_message_id?: string; error?: string },
    ): Promise<void>;

In `src/lib/server/time.ts`:

    export function nowIso(): string;   // ISO 8601, e.g. new Date().toISOString()

In `src/lib/server/sms.ts`:

    export type SmsSendResult =
      | { kind: 'sent'; providerMessageId: string | null }
      | { kind: 'stubbed' }
      | { kind: 'failed'; error: string };

    export function sendSms(env: App.Platform['env'], to: string, body: string): Promise<SmsSendResult>;

In `src/lib/server/fanout.ts`:

    export function fanoutMessage(
      db: D1Database, env: App.Platform['env'], messageId: string,
    ): Promise<void>;

In `src/app.d.ts`, the platform binding shape:

    declare global {
      namespace App {
        interface Platform {
          env: {
            DB: D1Database;
            TWILIO_ACCOUNT_SID?: string;
            TWILIO_AUTH_TOKEN?: string;
            TWILIO_FROM_NUMBER?: string;
          };
        }
      }
    }
    export {};

Route handlers reach the database and secrets through the SvelteKit `RequestEvent`: `event.platform.env.DB` and `event.platform.env.TWILIO_*`. Identifiers for new rows use `crypto.randomUUID()`; all timestamps use `nowIso()` from `time.ts`.

---

Revision note (2026-05-16): Initial authoring of this ExecPlan from the household-hub v1 build specification and `.agent/PLANS.md`. Two deviations from the generic `.agent/PLANS.md` text are recorded in the Decision Log and made explicit so a future reader does not mistake them for omissions: v1 uses direct fanout rather than Cloudflare Queues, and the v1 validation gate is `check` + `build` + `curl` transcript + unit tests rather than a Playwright E2E suite. Both are permitted by `CLAUDE.md`'s v1 scope; both are flagged as follow-ups in the README and "Outcomes & Retrospective".
