/// <reference types="@cloudflare/workers-types" />
import { error } from '@sveltejs/kit';

// SvelteKit types `event.platform` as possibly-undefined because not every
// adapter provides it. On the Cloudflare runtime it is always present. This
// helper asserts that once, so route handlers get a typed D1 binding without
// repeating the guard.
export function requireDb(platform: App.Platform | undefined): D1Database {
	if (!platform?.env?.DB) {
		throw error(500, 'Database binding unavailable (platform.env.DB missing)');
	}
	return platform.env.DB;
}
