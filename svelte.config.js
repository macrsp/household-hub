import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Cloudflare Pages / Workers adapter. The app runs on the Cloudflare
		// runtime; D1 and secrets reach route handlers via event.platform.env.
		adapter: adapter(),
		csrf: {
			// The Twilio inbound-SMS webhook (POST /api/webhooks/sms) is a
			// cross-origin, form-encoded POST from api.twilio.com, which
			// SvelteKit's default same-origin check rejects. The app's own
			// writes use application/json — a content type that check never
			// covered — so disabling it does not weaken them. The webhook's
			// real protection is Twilio request-signature validation; see the
			// TODO in src/routes/api/webhooks/sms/+server.ts.
			checkOrigin: false
		}
	}
};

export default config;
