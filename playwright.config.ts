import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './e2e/test-config.mjs';

// End-to-end test lane (M31). The suite drives the *real* household-hub
// stack — SvelteKit routes on `wrangler pages dev` over a local D1 — with no
// API mocking. `scripts/e2e/start-server.mjs` builds, migrates the local D1,
// and starts the dev server with the test-only bindings; Playwright manages
// that process and waits for the server to answer before running specs.
export default defineConfig({
	testDir: 'e2e',
	// One retry absorbs wrangler's first-request warm-up jitter.
	retries: process.env.CI ? 1 : 0,
	// The suite shares one local D1 and resets it per test, so specs must not
	// run in parallel against each other.
	workers: 1,
	fullyParallel: false,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	timeout: 30_000,
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: 'node scripts/e2e/start-server.mjs',
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		// wrangler's first boot may download workerd, so allow generous time.
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
