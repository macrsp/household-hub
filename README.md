# household-hub

A small, household-scale communication relay. It lets the members of one
household talk to each other in a single shared conversation even though they
each prefer a different channel — a web page, SMS text messages, and (later)
email — without anyone having to install the same app.

The guiding principle:

> **The app owns the canonical conversation. SMS, email, and the web app are
> transport adapters.**

Every inbound message — from the web app or from an SMS webhook — becomes one
row in the `messages` table. A *fanout* step then delivers a copy to every
other participant through their preferred channel. There is one authoritative
thread; the channels are just ways in and out of it.

This is not a SaaS product. It is a trusted, household-scale tool. Manual
setup is fine.

## What works in this version (v1)

- A single canonical conversation, `general`.
- A web page (`/`) that lists messages, lets you pick a sender, send a
  message, and polls for new messages every 3 seconds.
- An inbound SMS webhook (`POST /api/webhooks/sms`) that accepts Twilio-style
  form posts, maps the sender's number to a household member, and stores the
  text as a canonical message.
- Outbound SMS fanout: each delivery is sent as `[Author Name]: message body`.
  When Twilio credentials are absent, sending is **stubbed** — logged and
  recorded as `sent_stubbed` — so the whole relay runs without a Twilio
  account.

## MVP limitations (deliberately out of scope for v1)

No authentication or login. No public signup. No admin dashboard. No inbound
or outbound **email**. No MMS or attachments. No realtime/WebSockets — the web
app polls. No multiple conversations (the data model allows them; the UI and
SMS routing assume `general`). No multi-household tenancy. Twilio request
**signature validation is not implemented** — there is a `TODO` for it in
`src/routes/api/webhooks/sms/+server.ts`; until then, treat the webhook URL as
a secret. The data model leaves room for all of the above; the code does not
implement them.

## Data model

Cloudflare D1 (SQLite). Schema: [`migrations/0001_initial.sql`](migrations/0001_initial.sql);
notes and the canonical user-asset manifest: [`migrations/README.md`](migrations/README.md).

- `people` — household members.
- `endpoints` — a person's address on a transport (`sms` / `email` / `app`).
- `conversations` — conversation threads (v1 seeds one: `general`).
- `participants` — which people belong to which conversation.
- `messages` — the canonical messages; `source_transport` records where each
  came from (`app` / `sms` / `email` / `system`).
- `deliveries` — one row per fanout attempt to one endpoint, with a status.

## Local setup

Requires Node and npm.

    npm install
    npm run db:migrate:local    # apply the schema to a local D1 SQLite file
    npm run db:seed:local       # load seed.sql (general + three members)
    npm run build
    npm run preview             # serves on http://localhost:8788

`npm run dev` (plain Vite) does **not** bind D1 — use `npm run build && npm run
preview`, which runs the app under Wrangler with the D1 binding. Local D1 state
lives under `.wrangler/` (git-ignored); delete that directory to start fresh.

Gates: `npm run check` (type-check), `npm run build`, `npm run test:unit`.

## Cloudflare setup

`wrangler` is already authenticated for interactive use, but **automated and
remote `wrangler` work needs a `CLOUDFLARE_API_TOKEN`** — OAuth refresh
requires a browser flow. Either run `wrangler login` in your own terminal, or
create a scoped API token (Cloudflare dashboard → My Profile → API Tokens;
permissions: D1 edit, Workers/Pages edit) and export it:

    export CLOUDFLARE_API_TOKEN=...

Then create the remote database and paste its id into
[`wrangler.jsonc`](wrangler.jsonc) (the `database_id` field — it currently
holds an all-zero placeholder that only local development can use):

    npx wrangler d1 create household-hub-db
    npm run db:migrate:remote
    npm run db:seed:remote

`wrangler.jsonc` is the deploy-time source of truth for bindings; secret
*values* never go in it.

## Twilio setup

Outbound SMS needs three secrets. Locally, copy
[`.dev.vars.example`](.dev.vars.example) to `.dev.vars` (git-ignored) and fill
in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. In
production set them as Pages secrets:

    npx wrangler pages secret put TWILIO_ACCOUNT_SID
    npx wrangler pages secret put TWILIO_AUTH_TOKEN
    npx wrangler pages secret put TWILIO_FROM_NUMBER

With all three present, fanout sends real texts; with any missing, sending is
stubbed. Point your Twilio number's inbound-SMS webhook at
`https://<your-deployment>/api/webhooks/sms`.

## Testing inbound SMS locally

With `npm run preview` running, simulate a Twilio webhook with `curl` — a
known seeded number is accepted, an unknown number is rejected:

    curl -X POST http://localhost:8788/api/webhooks/sms \
      --data-urlencode 'From=+15550000002' --data-urlencode 'Body=texting in'
    # -> <?xml version="1.0" encoding="UTF-8"?><Response></Response>

    curl -X POST http://localhost:8788/api/webhooks/sms \
      --data-urlencode 'From=+19999999999' --data-urlencode 'Body=who am i'
    # -> HTTP 403, "Unknown sender ..."

The accepted message then appears at `http://localhost:8788/` within the
3-second poll.

## Inbound email setup

`POST /api/webhooks/email` ingests inbound email as a JSON payload
(`{ "from": "...", "to": "...", "body": "..." }`). The sender is mapped to a
household member by a registered `email` endpoint; the conversation is the
local part of the `to` address (`general@…`, `groceries@…`), falling back to
`general`.

Cloudflare Email Routing cannot POST to an HTTP endpoint directly, so a small
**Email Worker** bridges it — it MIME-parses the routed mail and forwards a
clean payload to the webhook with a shared-secret header. That Worker is
checked in at [`email-worker/`](email-worker/); see its README to deploy it.

When `EMAIL_WEBHOOK_SECRET` is set on the Pages project, the webhook rejects
any request without the matching `X-Webhook-Secret` header (`403`). Set the
same value on the Pages project and on the Email Worker:

    wrangler pages secret put EMAIL_WEBHOOK_SECRET     # household-hub Pages project
    cd email-worker && npx wrangler secret put EMAIL_WEBHOOK_SECRET

Then, in Cloudflare Email Routing for your domain, add a custom address per
conversation (`general@yourdomain`, `groceries@yourdomain`) with the action
**Send to a Worker → household-hub-email**.

Test the webhook directly with `curl` while `npm run preview` is running
(local dev has no `EMAIL_WEBHOOK_SECRET`, so no header is needed):

    curl -X POST http://localhost:8788/api/webhooks/email \
      -H 'content-type: application/json' \
      -d '{"from":"north0401@gmail.com","to":"groceries@example.invalid","body":"eggs"}'
    # -> {"ok":true,"messageId":"..."}

## Replacing the fake household members

[`seed.sql`](seed.sql) defines three people with obviously fake `+1555…`
phone numbers. Edit it directly: change each `display_name`, swap the fake
numbers in the `endpoints` rows for real mobile numbers in `+E.164` format,
and re-run `npm run db:seed:local` (and `:remote` for production). Every
statement is `INSERT OR IGNORE`, so re-running is safe; to change an existing
row, edit it in the database or reset local D1 and re-seed.

## Deploying

    npm run build
    npm run deploy        # wrangler pages deploy .svelte-kit/cloudflare

Requires Cloudflare auth (see "Cloudflare setup") and the real `database_id`
in `wrangler.jsonc`. Apply migrations to the remote database before the first
deploy. Verify with `https://<deployment>/api/health` → `{"ok":true}`.

## What to implement next

- Inbound and outbound **email** as another transport adapter (the data model
  already has `email` endpoint and transport values).
- **Auth** — so the sender is the logged-in user, not a dropdown choice.
- **Attachments** / MMS.
- **Multiple conversations** — routing inbound SMS to the right thread, and a
  conversation picker in the UI.
- **Realtime** delivery (WebSockets / Durable Objects) to replace polling.
- **Notification preferences** per participant (the `delivery_preference` and
  `muted` columns are unused scaffolding today).
- **Cloudflare Queues** for asynchronous fanout (v1 fans out synchronously —
  see the Decision Log in [`.agent/household-relay-v1.md`](.agent/household-relay-v1.md)).
- **Twilio request-signature validation** on the inbound webhook.
- **Post-deploy data probes** — one invariant query per user-asset table; the
  queries are written out in [`migrations/README.md`](migrations/README.md).
- `kit.csrf.checkOrigin` is `false` and must stay false: SvelteKit's CSRF
  check rejects any form-content-type POST whose `Origin` is absent, and the
  Twilio webhook (a server-to-server POST) sends no `Origin`, so
  `trustedOrigins` cannot admit it. If SvelteKit removes the deprecated
  `checkOrigin`, move the webhook to its own non-SvelteKit Worker route. See
  `.agent/post-v1-roadmap.md` M5.
