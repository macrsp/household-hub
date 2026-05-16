# household-hub email bridge Worker

A standalone Cloudflare **Email Worker** — the inbound bridge for household-hub.

Cloudflare Email Routing can route a message to a Worker but cannot POST to an
HTTP endpoint directly. This Worker receives routed mail, MIME-parses it with
`postal-mime`, and forwards a clean `{ from, to, body }` payload to
household-hub's `POST /api/webhooks/email`, authenticated with a shared-secret
`X-Webhook-Secret` header.

It is deployed separately from the main household-hub Pages app.

## Deploy

    cd email-worker
    npm install
    npx wrangler deploy

## Configure the shared secret

    npx wrangler secret put EMAIL_WEBHOOK_SECRET

The value must match `EMAIL_WEBHOOK_SECRET` on the household-hub Pages project
(`wrangler pages secret put EMAIL_WEBHOOK_SECRET`). When that secret is set on
the Pages side, the webhook rejects any request without the matching header.

`WEBHOOK_URL` is a plain var in `wrangler.jsonc` — change it if the
household-hub deployment URL changes.

## Route mail to it

In the Cloudflare dashboard → your domain → **Email → Email Routing → Routing
rules**, add a custom address for each conversation (e.g.
`general@yourdomain`, `groceries@yourdomain`) with the action **Send to a
Worker → household-hub-email**.
