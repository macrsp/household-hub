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
			};
		}
	}
}

export {};
