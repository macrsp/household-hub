import { defineConfig } from 'vitest/config';

// Unit tests run in plain Node, without the SvelteKit Vite plugin — the
// server helpers under src/lib/server are framework-agnostic.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts']
	}
});
