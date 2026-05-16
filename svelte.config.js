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
			// checkOrigin is DELIBERATELY false and must stay false — do not
			// "fix" the deprecation by switching to trustedOrigins.
			//
			// SvelteKit's CSRF check forbids any form-content-type POST whose
			// Origin header is absent OR not equal to the app origin OR not in
			// trustedOrigins (see @sveltejs/kit respond.js: the `!request_origin
			// || !csrf_trusted_origins.includes(...)` clause). The Twilio
			// inbound-SMS webhook (POST /api/webhooks/sms) is a server-to-server
			// form-encoded POST that sends no Origin header, so NO trustedOrigins
			// entry can admit it — only disabling the check entirely works.
			//
			// This does not weaken the app's own writes: they use
			// application/json, which the CSRF check never covered. The webhook
			// itself is protected by Twilio request-signature validation
			// (verifyTwilioSignature, src/routes/api/webhooks/sms/+server.ts).
			//
			// `checkOrigin` is deprecated upstream; if SvelteKit removes it,
			// the webhook must move to its own non-SvelteKit Worker route
			// rather than re-enabling the global check. See .agent/post-v1-roadmap.md.
			checkOrigin: false
		}
	}
};

export default config;
