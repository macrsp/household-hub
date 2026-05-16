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
		adapter: adapter()
	}
};

export default config;
