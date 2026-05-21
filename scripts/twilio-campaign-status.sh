#!/usr/bin/env bash
#
# Fetch the A2P 10DLC campaign status (and any rejection reason) from Twilio
# for every Messaging Service on the account. Run from the repo root:
#
#   bash scripts/twilio-campaign-status.sh
#
# Reads TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from the environment, or
# prompts for them (auth token is hidden). Nothing is written to disk; the
# call goes only to api.twilio.com over HTTPS with basic auth.
#
# Requires: curl, jq.

set -euo pipefail

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v jq   >/dev/null || { echo "jq is required";   exit 1; }

SID="${TWILIO_ACCOUNT_SID:-}"
TOKEN="${TWILIO_AUTH_TOKEN:-}"

if [ -z "$SID" ]; then
  read -rp  "TWILIO_ACCOUNT_SID (starts with AC...): " SID
fi
if [ -z "$TOKEN" ]; then
  read -rsp "TWILIO_AUTH_TOKEN: " TOKEN; echo
fi
[ -n "$SID" ]   || { echo "Account SID was empty — aborting.";  exit 1; }
[ -n "$TOKEN" ] || { echo "Auth Token was empty — aborting.";   exit 1; }

api() {
  # $1 = path (e.g. /v1/Services)
  curl -fsS -u "$SID:$TOKEN" "https://messaging.twilio.com$1"
}

echo
echo "=== Messaging Services on $SID ==="
SERVICES_JSON="$(api /v1/Services)"
echo "$SERVICES_JSON" | jq -r '.services[] | "\(.sid)  \(.friendly_name)"'

echo
echo "=== A2P 10DLC campaigns and statuses ==="
for SERVICE_SID in $(echo "$SERVICES_JSON" | jq -r '.services[].sid'); do
  FRIENDLY="$(echo "$SERVICES_JSON" | jq -r ".services[]|select(.sid==\"$SERVICE_SID\")|.friendly_name")"
  echo
  echo "--- Service $SERVICE_SID  ($FRIENDLY) ---"
  # The Usa2p compliance sub-resource carries the campaign-registration row
  # and the rejection reason text when there is one.
  if api "/v1/Services/$SERVICE_SID/Compliance/Usa2p" 2>/dev/null \
      | jq '{
            campaign_status: .campaign_status,
            campaign_id: .campaign_id,
            brand_registration_sid: .brand_registration_sid,
            use_case: .us_app_to_person_usecase,
            rejection_reason: .rejection_reason,
            errors: .errors,
            description: .description,
            message_samples: .message_samples,
            help_message: .help_message,
            opt_in_keywords: .opt_in_keywords,
            opt_out_keywords: .opt_out_keywords,
            help_keywords: .help_keywords,
            opt_in_message: .opt_in_message,
            opt_out_message: .opt_out_message
          }'; then :
  else
    echo "  (no Usa2p campaign on this service — or 404)"
  fi
done

echo
echo "Done."
