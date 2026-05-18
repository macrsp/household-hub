// Shared constants for the end-to-end test lane (M31). No side effects — safe
// to import from both the Playwright specs and the E2E server script.
//
// TEST_ROUTES_SECRET / EMAIL_WEBHOOK_SECRET are fixed test-only values bound
// onto the local `wrangler pages dev` server. They are never set on
// production Pages, so the gated /api/test/* route is disabled there.

export const BASE_URL = 'http://127.0.0.1:8788';
export const TEST_ROUTES_SECRET = 'household-hub-e2e-secret';
export const EMAIL_WEBHOOK_SECRET = 'household-hub-e2e-email-secret';
