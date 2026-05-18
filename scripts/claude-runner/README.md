# household-hub dev-channel runner

`run.mjs` connects the **`#claude` channel** in household-hub to Claude Code:
it polls the channel for change requests, runs Claude Code on each, and posts
the result back into the channel.

household-hub itself runs on Cloudflare Pages and **cannot run Claude Code** —
so this runner lives on a host you control (a home server, a small VM, a
Raspberry Pi, a laptop that's usually on) and runs on a cron.

## What it does, each run

1. Polls `GET /api/conversations/claude/messages?since=<cursor>` for requests
   newer than the last one it handled.
2. Keeps the human-authored ones (skips Claude Code's own posts), optionally
   filtered to an allowlist of requesters.
3. For up to `MAX_REQUESTS` of them: posts a "🛠️ On it" note, runs
   `claude -p "<request>"` headless in a clone of this repo, then posts
   Claude Code's summary back as a "✅ …" message.
4. Advances its cursor (stored in `.runner-state.json`, git-ignored).

On the **first run** it adopts "now" as the cursor and handles no backlog.

## Prerequisites on the host

- **Node 20+** and **git**.
- The **`claude` CLI** installed and working (`npm i -g @anthropic-ai/claude-code`).
- A **clone of this repo** the runner builds in, with `npm ci` already run and
  `git push` access (so Claude Code can branch, PR, merge).
- The **`gh` CLI** authenticated (Claude Code opens/merges PRs with it).

## Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Used by the `claude` CLI. **Required.** | — |
| `CLOUDFLARE_API_TOKEN` | Used by `wrangler` when Claude Code deploys. | — |
| `HOUSEHOLD_HUB_URL` | Base URL of the app. | `https://household.practicepartner.app` |
| `HH_REPO_DIR` | Path to the repo clone to build in. | this repo |
| `CLAUDE_REQUESTERS` | Comma-separated person ids allowed to trigger a build, or `all`. | `all` |
| `MAX_REQUESTS` | Most requests handled per run — a cost cap. | `1` |

## Run it

```sh
ANTHROPIC_API_KEY=sk-ant-… \
CLOUDFLARE_API_TOKEN=… \
node scripts/claude-runner/run.mjs
```

On a cron (every 10 minutes), with the env in the crontab or an env file:

```cron
*/10 * * * * cd /path/to/household-hub && node scripts/claude-runner/run.mjs >> /var/log/claude-runner.log 2>&1
```

## Optional: the daily digest (M63)

The same host can post a daily household digest by hitting the digest-post
endpoint on a cron. It generates the same summary as the in-app "What's new"
button and posts it into a conversation (default `general`) as Claude Code.

```cron
30 7 * * * curl -fsS -X POST "$HOUSEHOLD_HUB_URL/api/digest/post" -H "X-Webhook-Secret: $DIGEST_POST_SECRET" >> /var/log/household-digest.log 2>&1
```

If the `DIGEST_POST_SECRET` Cloudflare secret is set, the `X-Webhook-Secret`
header must match it; if it is unset, the header is not required. A quiet day
posts nothing.

## Guardrails

- **Cost cap.** `MAX_REQUESTS` (default 1) limits requests per run. Also set a
  spend limit on the Anthropic account — every request is a paid Claude Code
  session.
- **Broken builds can't ship.** The runner instructs Claude Code to follow
  `CLAUDE.md` — branch, run the gates, open a PR, and deploy only once CI is
  green. A request that produces failing gates does not reach production.
- **Allowlist.** Set `CLAUDE_REQUESTERS` to specific person ids to limit who
  can trigger a build; `all` lets any member.
- **No retry storms.** The cursor advances past a request even if it failed,
  so a bad request is attempted once, reported, and not repeated.
