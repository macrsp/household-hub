/// <reference types="@cloudflare/workers-types" />
// See https://svelte.dev/docs/kit/types#app.d.ts for these interfaces.
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}

		// Cloudflare runtime bindings, injected per-request as event.platform.env.
		interface Platform {
			env: {
				// Canonical relational store (Cloudflare D1).
				DB: D1Database;
				// Twilio credentials. When all three are present, outbound SMS
				// sends for real; when any is absent, sending is stubbed.
				TWILIO_ACCOUNT_SID?: string;
				TWILIO_AUTH_TOKEN?: string;
				TWILIO_FROM_NUMBER?: string;
				// Email (Resend) credentials. When both are present, outbound
				// email sends for real; when either is absent, it is stubbed.
				RESEND_API_KEY?: string;
				EMAIL_FROM?: string;
				// Shared secret for the inbound-email bridge Worker. When set,
				// POST /api/webhooks/email requires a matching X-Webhook-Secret.
				EMAIL_WEBHOOK_SECRET?: string;
				// Shared secret for the scheduled digest poster. When set,
				// POST /api/digest/post requires a matching X-Webhook-Secret.
				DIGEST_POST_SECRET?: string;
				// Google OAuth client for the Gmail connection (M74). When all
				// three are present, the /api/google/* routes are live; absent
				// (local/CI), they report Gmail unconfigured. TOKEN_ENCRYPTION_KEY
				// is a base64 256-bit key that encrypts the stored OAuth tokens.
				GOOGLE_CLIENT_ID?: string;
				GOOGLE_CLIENT_SECRET?: string;
				TOKEN_ENCRYPTION_KEY?: string;
				// Optional shared secret for the Gmail sync poster (M75). When
				// set, POST /api/google/sync requires a matching X-Webhook-Secret.
				GMAIL_SYNC_SECRET?: string;
				// Optional shared secret for the changelog poster (M77). When
				// set, POST /api/changelog requires a matching X-Webhook-Secret.
				CHANGELOG_SECRET?: string;
				// Public base URL of the deployed app (not a secret) — used to
				// build the Twilio delivery-status callback URL.
				PUBLIC_APP_URL?: string;
				// Cloudflare Workers AI binding. Present in production; absent
				// in local/CI, where AI features report themselves unavailable.
				AI?: Ai;
				// Cloudflare Vectorize index for semantic message search (M66).
				// Present in production; absent in local/CI, where semantic
				// search reports itself unavailable.
				VECTORIZE?: VectorizeIndex;
				// Cloudflare Vectorize index for household-memory fact recall
				// (M72) — separate index, same gating.
				VECTORIZE_FACTS?: VectorizeIndex;
			};
			// The Cloudflare execution context — `waitUntil` keeps background
			// work (e.g. the @claude assistant reply) alive past the response.
			context?: { waitUntil(promise: Promise<unknown>): void };
		}
	}
}

export {};
