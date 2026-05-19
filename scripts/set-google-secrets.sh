#!/usr/bin/env bash
#
# Set the Google OAuth + token-encryption secrets on the household-hub
# Cloudflare Pages project (M74 — Gmail connection).
#
# Run from the repository root:
#   bash scripts/set-google-secrets.sh
#
# Each value is read interactively and piped to `wrangler pages secret put`
# with `printf %s` (no trailing newline, so the stored secret is exact). The
# client secret and encryption key are read with `-s` so they are not echoed
# to the terminal, and nothing is written to shell history.

set -euo pipefail

PROJECT="household-hub"

put_secret() {
  # $1 = secret name, $2 = secret value
  printf '%s' "$2" | npx wrangler pages secret put "$1" --project-name "$PROJECT"
}

echo "Setting Google OAuth secrets on the '$PROJECT' Cloudflare Pages project."
echo "Paste each value from the Google Cloud Console OAuth client."
echo

read -rp  "GOOGLE_CLIENT_ID:     " CLIENT_ID
[ -n "$CLIENT_ID" ] || { echo "GOOGLE_CLIENT_ID was empty — aborting."; exit 1; }

read -rsp "GOOGLE_CLIENT_SECRET: " CLIENT_SECRET; echo
[ -n "$CLIENT_SECRET" ] || { echo "GOOGLE_CLIENT_SECRET was empty — aborting."; exit 1; }

read -rsp "TOKEN_ENCRYPTION_KEY (leave blank to generate a fresh 256-bit key): " ENC_KEY; echo
if [ -z "$ENC_KEY" ]; then
  ENC_KEY="$(openssl rand -base64 32)"
  echo
  echo "Generated TOKEN_ENCRYPTION_KEY: $ENC_KEY"
  echo "  ^^ save this somewhere safe — it cannot be recovered, and rotating"
  echo "     it makes every already-connected Google account need reconnecting."
fi

echo
echo "Writing secrets to '$PROJECT'…"
put_secret GOOGLE_CLIENT_ID     "$CLIENT_ID"
put_secret GOOGLE_CLIENT_SECRET "$CLIENT_SECRET"
put_secret TOKEN_ENCRYPTION_KEY "$ENC_KEY"

echo
echo "Done — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY"
echo "are set on the '$PROJECT' Pages project."
