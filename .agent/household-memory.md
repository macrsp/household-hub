# Household Memory: a knowledge graph the family can ask

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository follows the ExecPlan discipline in [`.agent/PLANS.md`](PLANS.md); this document must be maintained in accordance with that file. It also follows [`CLAUDE.md`](../CLAUDE.md) for branch naming, gates, and the user-asset manifest in [`migrations/README.md`](../migrations/README.md).


## Purpose / Big Picture

Today `household-hub` is a relay: messages flow between people over SMS, email, and the web app, and a set of AI features (M54–M70) summarise, search, and answer questions about *those messages*. What it cannot do is *remember facts about the household itself*. Nobody can ask "what is the wifi password", "what size shoes does Sam wear", "who is Mia's teacher", or "when is the field trip" and get an answer, because that knowledge is scattered across hundreds of past messages — or was never written down at all.

After this work, the household has a **memory graph**: a small knowledge graph of the household's people, pets, places, organisations, things, and events, and the facts connecting them. Any member, from any channel, can ask the hub a plain-language question and get an answer drawn from that graph. The graph fills three ways: a member states a fact explicitly ("remember that the wifi password is hunter2"), the AI proposes facts it notices in conversation and a member confirms them, and — once a family member connects their Gmail — the AI proposes facts it extracts from their email (the dentist appointment, the school field trip) for confirmation.

You can see it working when, after connecting the pieces, you open the Household page, type "what's the wifi password" into the memory box, and get back the value a member stored earlier; and when, after someone writes "Mia's new teacher is Ms. Lee" in `#general`, a confirmation prompt appears and, once accepted, "who is Mia's teacher" answers correctly.

"Knowledge graph" here means: a set of **entities** (nodes — a person, a pet, the house, a school) and **facts** (edges — `wifi_password` of the house is "hunter2"; `teacher` of Mia is the entity Ms. Lee). It is stored as two ordinary tables in Cloudflare D1 (the project's SQLite database), not a graph database — see the Decision Log for why. It is "small": a household realistically has tens to a few hundred facts, ever.

"Coordination" (a shared calendar, shopping list, and chores) falls out of the same graph: a calendar event is a fact with a date attached; a shopping-list item is a fact with the predicate `needs`. The final milestones add views over those time-bound and list-shaped facts.


## Progress

- [x] (2026-05-18 18:12Z) M71 — Memory graph schema and explicit capture: migration `0012_memory_graph.sql` (the two tables plus a `people.role` column), `memory-kinds.ts`, typed DB helpers (`upsertEntity`, `insertFact`, `confirmFact`, `factsForSubject`, `findEntityByName`, `isAdult`), adult-gated `/api/memory/facts` and `/api/memory/entities` routes, manifest updated, parity test `memory-kinds.test.ts`, E2E `api-memory.spec.ts`. Gates green: check 449 files, unit 134, build, e2e api-memory 5.
- [x] (2026-05-18 18:22Z) M72 — Semantic recall and the "Ask the household" UI: the `household-hub-facts` Vectorize index created and bound as `VECTORIZE_FACTS`; `memory-index.ts` (`factSentence`, `indexFact`, `relevantFactIds`); explicit facts indexed on write; `POST /api/memory/ask` answering from recent + semantically-relevant facts; a "🧠 Household memory" box on the Household page with an adult asker selector. Gates green: check 453, unit 138, build, e2e api-memory 8.
- [x] (2026-05-18 18:31Z) M73 — AI fact extraction from conversations: `memory-extract.ts` (`parseExtractedFacts`, `extractFacts`) wired into the messages POST route via `waitUntil`; `GET /api/memory/proposed`; `POST /api/memory/facts/[id]/confirm` (indexes the fact) and `.../reject`; a "facts to review" panel on the Household page. Gates green: check 461, unit 144, build, e2e api-memory 10.
- [x] (2026-05-19 23:40Z) M74 — Gmail OAuth connection: migration `0013_google_accounts.sql`; `src/lib/server/google.ts` (AES-GCM `encryptToken`/`decryptToken`, HMAC-signed OAuth `state`, `exchangeCode`, `refreshAccessToken`, `revokeToken`, `gmailProfile`); `/api/google/connect`, `/callback`, `/accounts`, `/disconnect`; db helpers (`upsertGoogleAccount`, `listGoogleAccountsSafe`, `listGoogleAccounts`, `getGoogleAccount`, `deleteGoogleAccount`); a "Connected email" panel on the Household page with the in-product privacy notice; `scripts/set-google-secrets.sh`. The spike is folded into the real callback — it reads the Gmail profile, which confirms the `gmail.readonly` scope end to end. Gates green: check 473, unit 153, build, e2e api-google 4. Operator action still pending: the OAuth client + verification in the Google Cloud Console, and `bash scripts/set-google-secrets.sh`.
- [ ] M75 — Gmail ingestion to fact extraction: cron-driven incremental sync, extraction into the propose→confirm loop, no raw email bodies stored.
- [ ] M76 — Coordination view: a calendar over time-bound facts and a shared shopping list over `needs` facts.
- [ ] M77 — The app's own changelog: when a dev-channel build merges, the runner posts a plain-language changelog entry into a channel (#6 from the brainstorm).

M71–M74 are complete and deployed. The M74 code is live; the Gmail feature
activates once the operator finishes the Google Cloud OAuth client and runs
`scripts/set-google-secrets.sh`. M75 is next.


## Context and Orientation

`household-hub` is a SvelteKit + TypeScript app on the Cloudflare Workers/Pages runtime. Persistent relational data lives in Cloudflare D1 (a SQLite database); the binding is `event.platform.env.DB`, typed in `src/app.d.ts`. Schema changes are checked-in migration files under `migrations/`, applied with `npm run db:migrate:local` then `npm run db:migrate:remote` — never ad-hoc SQL against the remote database. The canonical list of user-asset record classes (tables whose loss would break a promise to the user) is the manifest in `migrations/README.md`; this plan adds to it.

Server-only code lives under `src/lib/server/`. Database access is raw SQL through thin typed helpers in `src/lib/server/db.ts` — there is no ORM. API routes are SvelteKit server routes at `src/routes/api/**/+server.ts`. The single-page conversation UI is `src/routes/+page.svelte`; the household-management page is `src/routes/household/+page.svelte`.

Three pieces of existing AI infrastructure this plan builds on, all gated so they degrade to "unavailable" when their binding is absent (local development and CI):

The Workers AI binding `event.platform.env.AI` (added M54) runs language and embedding models on Cloudflare with no external API key. Text generation uses `@cf/meta/llama-3.1-8b-instruct`; embeddings use `@cf/baai/bge-base-en-v1.5` (768-dimensional vectors). The wrapper `src/lib/server/embeddings.ts` exposes `embedText` and `embedTexts`.

The Vectorize binding `event.platform.env.VECTORIZE` (added M66) is a vector index, `household-hub-messages`, holding one embedding per message for semantic search. `src/lib/server/semantic-index.ts` holds `indexMessage`, `indexMessages`, and `relevantMessageIds`.

The E2E test lane (`scripts/e2e/start-server.mjs`) runs `wrangler pages dev` against a generated `wrangler.jsonc` with the `ai` and `vectorize` bindings stripped, because those bindings open remote proxy sessions needing Cloudflare account auth the CI runner lacks. Any new binding this plan adds (none is currently planned beyond reusing `AI` and `VECTORIZE`, plus a second Vectorize index) must be handled the same way.

Background work that must outlive the HTTP response uses `event.platform.context.waitUntil(promise)` — the messages POST route already uses it for fanout, push, the @claude assistant, and message indexing.

Two existing patterns this plan reuses directly. First, the optional-shared-secret webhook: `POST /api/webhooks/email` and `POST /api/digest/post` require a header `X-Webhook-Secret` matching an environment secret *when that secret is set*, and skip the check when it is not — the M75 Gmail sync endpoint uses the same pattern. Second, the dev-channel runner: a Node script on a host the operator controls (`scripts/claude-runner/`) hits the deployed app on a cron; M75's Gmail polling and M77's changelog post are cron jobs on that same host.


## Data Model

This plan adds three tables. All are created by checked-in migrations under `migrations/`, applied local-first then remote. Two of them — `memory_entities` and `memory_facts` — are new **user-asset record classes** and must be added to the manifest in `migrations/README.md`. The third, `google_accounts`, holds OAuth tokens and is treated with the same write-path care (its loss is recoverable by re-authorising, but it is user-linked sensitive data).

The single declared source of truth for the enum-like string sets the server validates against is a new file `src/lib/server/memory-kinds.ts`, exporting `ENTITY_KINDS` and `FACT_SOURCES` as `const` arrays. Both the client and the server import these; no server validator may hand-maintain a duplicate set. This satisfies PLANS.md invariant three.

`memory_entities` — the nodes of the graph. Columns:

    id            TEXT PRIMARY KEY            -- crypto.randomUUID()
    kind          TEXT NOT NULL               -- one of ENTITY_KINDS
    name          TEXT NOT NULL               -- display name, e.g. "Mia", "the house", "Lincoln Elementary"
    person_id     TEXT                        -- nullable FK -> people(id); set when the entity IS a household member
    created_at    TEXT NOT NULL               -- ISO 8601

`ENTITY_KINDS` is `['person', 'pet', 'place', 'org', 'thing', 'event']`. An entity of kind `person` may link to an existing `people` row via `person_id` so that "Mia" the household member and "Mia" the graph node are the same thing; it is nullable because the graph also holds people who are not hub members (a teacher, a doctor).

`memory_facts` — the edges. Each fact is a triple: a subject entity, a predicate, and an object that is *either* a literal string *or* another entity. Columns:

    id                TEXT PRIMARY KEY
    subject_id        TEXT NOT NULL           -- FK -> memory_entities(id)
    predicate         TEXT NOT NULL           -- a short snake_case relation, e.g. "wifi_password", "teacher", "shoe_size", "event_date"
    object_text       TEXT                    -- the literal value, when the object is a value
    object_entity_id  TEXT                    -- FK -> memory_entities(id), when the object is another node
    valid_at          TEXT                    -- nullable ISO date/time; set for time-bound facts (events, appointments)
    confidence        REAL NOT NULL           -- 0.0–1.0; 1.0 for explicit facts, lower for AI-extracted
    status            TEXT NOT NULL           -- 'proposed' or 'confirmed'
    source            TEXT NOT NULL           -- one of FACT_SOURCES
    source_message_id TEXT                    -- nullable FK -> messages(id), when learned from a hub message
    source_ref        TEXT                    -- nullable opaque ref, e.g. a Gmail message id, for dedup
    created_at        TEXT NOT NULL
    confirmed_at      TEXT                    -- nullable ISO; set when a member confirms
    confirmed_by      TEXT                    -- nullable FK -> people(id)

`FACT_SOURCES` is `['explicit', 'conversation', 'email']`. Exactly one of `object_text` and `object_entity_id` is non-null — the typed insert helper enforces this, and the M71 post-deploy probe asserts no row violates it. A fact is *live* (visible to recall) only when `status = 'confirmed'`; a `proposed` fact is awaiting a member's confirmation. Explicit facts are inserted already `confirmed` with `confidence = 1.0`.

`google_accounts` — one row per connected Gmail account (M74). Columns:

    id             TEXT PRIMARY KEY
    person_id      TEXT NOT NULL              -- FK -> people(id); who connected this account
    email          TEXT NOT NULL UNIQUE       -- the Gmail address
    access_token   TEXT NOT NULL              -- OAuth access token, encrypted at rest
    refresh_token  TEXT NOT NULL              -- OAuth refresh token, encrypted at rest
    token_expiry   TEXT NOT NULL              -- ISO 8601; when access_token expires
    history_id     TEXT                       -- nullable; Gmail's last-synced historyId for incremental sync
    created_at     TEXT NOT NULL

The `access_token` and `refresh_token` columns hold the tokens **encrypted at
rest** — AES-GCM via the Web Crypto API, under a 256-bit key supplied only as
the Worker secret `TOKEN_ENCRYPTION_KEY`. `src/lib/server/google.ts` exposes
`encryptToken` / `decryptToken`; the plaintext token exists only transiently in
memory while a Gmail request is made. The Decision Log records why this is
required.


## Milestones

### M71 — The memory graph and explicit capture

This milestone creates the graph and the ability to put facts in and read them out *by hand* — no AI yet. At the end, a member can store a fact and retrieve it, proving the schema and the typed write path before any extraction or semantic layer is built on top.

Create migration `migrations/0012_memory_graph.sql` defining `memory_entities` and `memory_facts` exactly as in the Data Model section, with the foreign keys and an index on `memory_facts(subject_id)` and on `memory_facts(predicate)`. The same migration adds a `role` column to the existing `people` table — `role TEXT NOT NULL DEFAULT 'member'` — where `'adult'` marks a household member trusted with the memory graph and the Gmail connection, and `'member'` is everyone else (children, guests). The seed/reset fixtures mark the household's main adults as `'adult'`.

Add `src/lib/server/memory-kinds.ts` exporting `ENTITY_KINDS` and `FACT_SOURCES`. Add typed helpers to `src/lib/server/db.ts`: `upsertEntity`, `insertFact`, `confirmFact`, `factsForSubject`, `findEntityByName`, and `isAdult` (returns whether a `people.id` has `role = 'adult'`). `insertFact` must reject a fact where neither or both of `object_text`/`object_entity_id` are set, and must reject a `kind` or `source` outside the declared sets.

Every `/api/memory` route is adult-gated: the request carries the acting `personId`, and the route returns 403 unless `isAdult` holds. The memory UI is only rendered for an adult member. This keeps household guests and children out of the graph that holds the wifi password and similar — see the Decision Log.

Add API routes under `src/routes/api/memory/`: `POST /api/memory/facts` accepts `{ subject, predicate, object, objectIsEntity?, validAt? }`, resolves or creates the subject entity by name, stores a `confirmed` explicit fact, and returns it; `GET /api/memory/facts?subject=<name>` returns the confirmed facts for an entity; `GET /api/memory/entities` lists entities. Validate every request body and return typed errors, matching the existing routes' style.

Update `migrations/README.md` to add `memory_entities` and `memory_facts` to the user-asset manifest.

Acceptance: after `npm run db:migrate:local`, start the app, `POST /api/memory/facts` with `{ subject: "the house", predicate: "wifi_password", object: "hunter2" }` returns 201; `GET /api/memory/facts?subject=the%20house` returns that fact. `npm run check`, `npm run build`, `npm run test:unit`, and `npm run test:e2e` all pass; a new `e2e/api-memory.spec.ts` asserts the round-trip.

### M72 — Semantic recall and "Ask the household"

This milestone makes the graph *answerable in plain language*. At the end, a member types a question into a memory box on the Household page and gets an AI answer drawn from the relevant facts.

Create a second Vectorize index, `household-hub-facts` (768-dim, cosine), via the Vectorize v2 REST API — the same method M66 used for `household-hub-messages`, because wrangler's `vectorize` subcommands cannot run with this account's Account API Token (see that milestone's notes, carried into this plan's Decision Log). Add a `VECTORIZE_FACTS` binding to `wrangler.jsonc` and `src/app.d.ts`, and strip it in `scripts/e2e/start-server.mjs` alongside `ai` and `vectorize`.

Each confirmed fact is embedded as a short sentence ("The wifi_password of the house is hunter2") and upserted to `household-hub-facts`, keyed by fact id. Add `src/lib/server/memory-index.ts` with `indexFact` and `relevantFactIds`, mirroring `semantic-index.ts`. M71's `confirmFact` and the explicit-fact route now also index.

Add `POST /api/memory/ask` accepting `{ question }`: embed the question, retrieve the most relevant confirmed facts via `relevantFactIds`, also pull facts whose predicate the question mentions, and ask `@cf/meta/llama-3.1-8b-instruct` to answer from only those facts. Gate exactly like the other AI routes: 503 `{ available: false }` when AI or Vectorize is absent.

On `src/routes/household/+page.svelte`, add a "Household memory" box: a text input and an answer area, calling `/api/memory/ask`.

Acceptance: with the bindings present, storing the wifi fact (M71) then asking "what's the wifi password" returns the value. All four gates pass; `e2e/api-memory.spec.ts` gains a 503-path test for the ask route.

### M73 — AI fact extraction from conversations

This milestone makes the graph fill *itself* from chat. At the end, writing a fact-shaped sentence in a conversation produces a confirmation prompt, and accepting it makes the fact answerable.

Add `src/lib/server/memory-extract.ts` with `extractFacts(env, conversationId, message)`: it asks the model to extract candidate facts from a message as structured triples, and stores each as a `proposed` fact (`source = 'conversation'`, `confidence` from the model, `source_message_id` set). It is best-effort and self-gating like the @claude assistant. Wire it into the messages POST route via `waitUntil`.

Add `GET /api/memory/proposed` (lists `proposed` facts) and `POST /api/memory/facts/[id]/confirm` and `.../reject`. Confirming flips `status` to `confirmed`, stamps `confirmed_at`/`confirmed_by`, and indexes the fact (M72). Rejecting deletes the row.

Add a review surface: a small "N facts to review" affordance that opens a list of proposed facts with Confirm/Reject buttons. Place it on the Household page near the memory box.

Acceptance: posting "Mia's teacher is Ms. Lee" produces a proposed fact; confirming it makes "who is Mia's teacher" answer "Ms. Lee". Gates pass; E2E covers the proposed→confirm→recall path on the 503-degraded lane by exercising the explicit-confirm route directly.

### M74 — Gmail OAuth connection (spike, then build)

This milestone connects a Google account. It begins as a spike because Gmail read access uses a *restricted* OAuth scope, and the consequences (see Decision Log and Surprises) must be confirmed against the real `practicepartner.app` Google Cloud project before ingestion is built on top.

Spike first: register an OAuth client in the existing Google Cloud project with redirect URI `https://household.practicepartner.app/api/google/callback`; set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a freshly generated 256-bit `TOKEN_ENCRYPTION_KEY` via `wrangler pages secret put`. Implement `GET /api/google/connect` (redirects to Google's consent screen requesting scope `https://www.googleapis.com/auth/gmail.readonly` plus `openid email`, with a signed `state`) and `GET /api/google/callback` (verifies `state`, exchanges the `code` at `https://oauth2.googleapis.com/token`, stores a `google_accounts` row). Add migration `migrations/0013_google_accounts.sql`. Add `src/lib/server/google.ts` with: `encryptToken` / `decryptToken` (AES-GCM via the Web Crypto API under `TOKEN_ENCRYPTION_KEY`, so the `access_token` and `refresh_token` columns are ciphertext at rest — required by the restricted-scope security assessment and promised in `/privacy`); the OAuth token exchange; a `freshAccessToken` helper that decrypts, refreshes when `token_expiry` has passed, and re-encrypts; and a thin Gmail API client (`https://gmail.googleapis.com/gmail/v1/users/me/...`). The disconnect route deletes the `google_accounts` row, taking the stored tokens with it.

Prove the spike: after connecting one account, a temporary `GET /api/google/debug` (removed before the milestone closes) returns that account's Gmail profile and the subject of its most recent message. This confirms the scope works end to end and surfaces the restricted-scope behaviour (testing-mode token lifetime, or production verification status) for the Decision Log.

Build: a Household-page "Connect Gmail" button per member; a connected-state indicator; a disconnect route that deletes the `google_accounts` row.

Acceptance: a member connects their account and sees "Connected"; the debug endpoint shows their profile; the spike findings are written into Surprises & Discoveries and the Decision Log; the debug endpoint is then removed.

### M75 — Gmail ingestion to fact extraction

This milestone feeds connected inboxes into the same propose→confirm loop. At the end, an email about a field trip becomes a proposed fact a parent can confirm.

Add `POST /api/google/sync`, gated by an optional `GMAIL_SYNC_SECRET` header exactly like `/api/digest/post`. For each `google_accounts` row it refreshes the access token, lists messages new since `history_id` (or a recent window on first sync), fetches each message's text, runs `extractFacts` with `source = 'email'` and `source_ref` set to the Gmail message id, and advances `history_id`. Raw email bodies are never written to D1 — only extracted candidate facts and the message id for dedup. Document a cron line for the runner host in `scripts/claude-runner/README.md`.

Acceptance: with a connected account, calling the sync endpoint produces proposed facts from real email; confirming one makes it answerable. Gates pass; `e2e/api-google.spec.ts` covers the sync endpoint's 503/secret/empty paths (no real Google auth in CI).

### M76 — Coordination view

This milestone surfaces the time-bound and list-shaped facts as a calendar and a shopping list. A calendar event is a confirmed fact with `valid_at` set; a shopping-list item is a confirmed fact with predicate `needs`. Add `GET /api/memory/calendar` (facts with `valid_at`, ordered) and `GET /api/memory/list?name=shopping` (facts with the `needs` predicate). Add a calendar strip and a shopping-list panel to the UI; adding a list item is an explicit fact write. Acceptance: a confirmed event with a date appears on the calendar; texting "milk" through the existing SMS path, once extraction tags it, appears on the list after confirmation.

### M77 — The app's own changelog

When a dev-channel build merges and deploys, the runner posts a plain-language changelog line into a designated channel, so the household sees the app describing its own growth. Add `POST /api/changelog` (optional-secret gated) that accepts a summary and posts it as `person-claude`; the runner calls it after a successful deploy. Acceptance: a runner-driven build results in a changelog message in the channel.


## User-Asset Write-Path Checklist

This plan touches the write paths of user-asset record classes, so per PLANS.md this checklist is mandatory.

First — the user-asset record classes written: `memory_entities` and `memory_facts` (new; added to the manifest in `migrations/README.md` by M71). `google_accounts` is written by M74; its loss is recoverable by re-authorising, so it is treated as sensitive-but-not-asset, yet held to the same write-path care below. The existing `messages` class is *not* newly written by this plan — extraction reads messages and writes facts.

Second — the validators and shape gates: all `memory_entities`/`memory_facts` writes go through the typed helpers `upsertEntity`, `insertFact`, and `confirmFact` in `src/lib/server/db.ts`. `insertFact` is the shape gate: it rejects a fact whose object is neither-or-both literal-and-entity, and rejects a `kind`/`source` outside the declared sets in `src/lib/server/memory-kinds.ts`. `google_accounts` writes go through `upsertGoogleAccount` in `src/lib/server/db.ts`.

Third — the tests: a parity test `src/lib/server/memory-kinds.test.ts` enumerates `ENTITY_KINDS` and `FACT_SOURCES` and asserts `insertFact`/`upsertEntity` accept a fixture for each entry and reject an unknown one — this catches a server validator drifting from the declared set. A post-deploy probe is added per new class to the CI post-deploy lane: for `memory_facts`, "zero rows where `object_text` and `object_entity_id` are both null or both non-null" and "zero facts whose `subject_id` references a missing entity"; for `memory_entities`, "zero entities of an unknown `kind`"; for `google_accounts`, "zero rows with an empty `refresh_token`". `e2e/api-memory.spec.ts` covers the explicit-write and proposed→confirm→recall round trips; it would catch a regression that accepted a malformed fact or dropped a confirmed one.

Fourth — the new try/catch blocks around user-asset writes: `extractFacts` (M73) and the Gmail sync loop (M75) wrap their work in try/catch. Neither is a silent fallback of a user-asset write: extraction *proposes* facts and the proposal insert either succeeds or throws; the catch only prevents a model or network failure from breaking the unrelated message-send or sync run, and is the same best-effort pattern as the @claude assistant. The actual user-asset commit — a member confirming a fact via `POST /api/memory/facts/[id]/confirm` — has no catch: it succeeds and returns the confirmed fact, or it throws and returns a typed error. The M75 sync loop uses per-account try/catch so one account's failure does not abort the others (PLANS.md invariant two); a test in `e2e/api-google.spec.ts` asserts that policy against a fixture of two accounts where the first fails.


## Validation and Acceptance

Each milestone runs the full local gate before commit and push: `npm run check`, `npm run build`, `npm run test:unit`, and `npm run test:e2e`. Per PLANS.md, E2E is part of the local gate, not CI-only, because the milestones touch routes and the rendered DOM. Each milestone is a branch following `CLAUDE.md` naming (`feat/db-…`, `feat/api-…`, `feat/pwa-…`), a PR against `main`, CI green, merge, deploy, and — for milestones M71–M73 and M76 — a verification against the deployed app (store a fact, ask a question). M74 and M75 are verified with a real connected Google account.

The headline acceptance for the whole plan: on the deployed app, a member stores "the wifi password is hunter2", another member asks "what's the wifi password" from a different device and gets "hunter2"; a member writes "Mia started at Lincoln Elementary" in a conversation, a confirmation prompt appears, and after acceptance "where does Mia go to school" answers "Lincoln Elementary".


## Idempotence and Recovery

Migrations use `CREATE TABLE IF NOT EXISTS` and are safe to re-apply. Fact embedding is keyed by fact id, so re-indexing overwrites rather than duplicates, exactly as message indexing does. The Gmail sync is incremental by `history_id` and de-duplicates by `source_ref` (the Gmail message id), so a repeated or overlapping sync run proposes no duplicate facts. OAuth token refresh is idempotent — a refresh that races another simply writes the same kind of fresh token. If the `household-hub-facts` index is lost, it is rebuilt from the confirmed rows of `memory_facts`, which remain the source of truth in D1.


## Decision Log

2026-05-18 — Graph storage is D1, not a graph database. Cloudflare's Workers runtime has no persistent filesystem, so an embedded graph database (KùzuDB, CozoDB, and the Kuzu forks VelaDB/LadybugDB the operator raised — all now unmaintained or requiring a server) cannot be the store of record; it would have to be reloaded from object storage per request. A hosted graph database (Neo4j Aura) is reachable over its HTTP query API but adds an external paid dependency, a secret, latency, and a failure mode, against this repo's stated ethos. A household graph is tens to a few hundred facts; modelled as `memory_entities` (nodes) and `memory_facts` (edges) it is a real graph, queryable with SQL and, if ever needed, `WITH RECURSIVE` for multi-hop traversal. The operator confirmed this direction.

2026-05-18 — Future-option note: RyuGraph as a documented escape hatch. The operator raised RyuGraph — an embedded, in-process property graph database forked from Kuzu, offering Cypher, disk-based columnar storage, full-text search, and a vector index, with no separate database server to run. It is embedded, so like any embedded engine it needs a host with a real filesystem and therefore still cannot run inside the Cloudflare Workers runtime; it would have to live in an always-on service. If the household graph ever outgrows what D1 + Vectorize comfortably serve — genuine multi-hop Cypher traversal, large-scale full-text search — the documented path is to embed RyuGraph in a small long-running service co-located with the dev-channel runner host. The operator's sizing research: 1 GB RAM minimum (budget 2 GB if the vector index, full-text search, or bulk imports are exercised); cheapest practical hosts are Fly.io `shared-cpu-1x` 1 GB (~$6–7/mo) with a persistent volume, or AWS Lightsail 1 GB (~$5/mo), with a scheduled backup of the database directory to R2/S3. This is recorded only as a future option; nothing in this plan depends on it, and D1 + Vectorize remain the chosen storage.

2026-05-18 — Facts are captured AI-proposed-then-confirmed, not silently. The operator chose this over explicit-only capture. A fact the AI extracts is stored `proposed` and is invisible to recall until a member confirms it, so the graph never answers with something nobody vouched for. Explicit "remember that…" facts skip the proposed state.

2026-05-18 — Email ingestion uses the Gmail API with OAuth (Path B), not Gmail forwarding rules (Path A). The operator already runs a `practicepartner.app` Google Cloud project whose users pass the OAuth consent screen, so the marginal cost of Path B is lower for this operator than the general case, and it avoids per-person forwarding-rule setup. Risk carried into M74 as a spike: `gmail.readonly` is a Google *restricted* scope; depending on the project's publishing status, this can mean refresh tokens that expire every seven days (testing mode) or a required CASA security assessment (production). M74 confirms which applies before M75 builds on it.

2026-05-18 — OAuth tokens are encrypted at rest (revised). An earlier draft of
this plan accepted storing the Gmail OAuth tokens in D1 as plain text on the
"trusted household tool" rationale. That is superseded: the Gmail scope is a
Google *restricted* scope, so the project must pass Google's annual security
assessment (CASA, against the OWASP ASVS), and ASVS 6.1.1 requires regulated
private data — which OAuth tokens are — to be encrypted at rest. The published
Privacy Policy at `/privacy` now also states plainly that these tokens are
encrypted at rest, so the implementation must match the promise. M74 therefore
encrypts `access_token` and `refresh_token` with AES-GCM (Web Crypto) under the
`TOKEN_ENCRYPTION_KEY` Worker secret before they are written, and decrypts them
only transiently when a Gmail request is made. The key is never stored in D1
and never logged.

2026-05-18 — The memory graph and Gmail connection are adult-only. The operator stated these are for the two main adults of the household, not guests or children. A `people.role` column (`'adult'` / `'member'`) is added in M71; all `/api/memory` routes and the M74 Gmail-connect flow check `isAdult` and the UI is shown only to adults. The app has no login — identity is the chosen `personId`, consistent with the existing trusted-household posture — so this is a soft gate (UI plus a route check), not an authentication boundary. The same `role` will gate who appears in the `#claude` dev channel when M77-area work touches it.

2026-05-18 — Reading family members' text messages is out of scope, with a platform reason worth recording. On iOS there is no API for a third-party app to read SMS or iMessage — Apple does not expose the Messages store to apps at all (the nearest thing, one-time-code autofill, never hands the app message contents), so an "iOS app that reads texts" is not buildable. On Android an app *can* read SMS with the `READ_SMS` permission, but Google Play restricts that permission to default-SMS-handler apps and a few declared categories, which a household relay is not. The hub already captures texts sent to its own Twilio number; that remains the only text stream available. The plan covers email only. If text ingestion is ever revisited, the realistic path is an Android-only companion app accepted into the restricted-permission program — a separate effort, not this plan.

2026-05-18 — Google Cloud setup is operator action, tracked like Twilio. M74 needs an OAuth client (client id + secret) and the `gmail.readonly` scope configured in the operator's `practicepartner.app` Google Cloud project, and the secrets set via `wrangler secret put`. This is the operator's to do, exactly as the Twilio credentials and A2P registration are; the plan's `Progress` and the project status log carry it as a pending external dependency, and M74's spike does not block earlier milestones.


## Surprises & Discoveries

None yet — this section will record what M74's OAuth spike learns about the restricted-scope behaviour, any Gmail API quirks, and model-extraction quality observations from M73/M75.


## Outcomes & Retrospective

Pending — to be written as milestones complete.
