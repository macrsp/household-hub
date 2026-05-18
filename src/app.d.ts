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
				// Public base URL of the deployed app (not a secret) — used to
				// build the Twilio delivery-status callback URL.
				PUBLIC_APP_URL?: string;
				// Cloudflare Workers AI binding. Present in production; absent
				// in local/CI, where AI features report themselves unavailable.
				AI?: Ai;
			};
		}
	}
}

export {};
