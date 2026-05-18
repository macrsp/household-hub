#!/usr/bin/env node
//
// E2E test server (M31). Playwright's `webServer` runs this script: it
// produces a production build, applies the D1 migrations to the LOCAL
// database, then starts `wrangler pages dev` with the test-only bindings the
// suite needs. The script stays in the foreground for as long as wrangler
// runs; Playwright kills it on teardown.
//
// The test bindings (`TEST_ROUTES_SECRET`, `EMAIL_WEBHOOK_SECRET`) are
// fixed constants used only here and in the spec files — they are never set
// on production Pages, so the gated /api/test/* route stays disabled there.
//
// Twilio credentials are deliberately NOT bound, so the SMS adapter stays in
// stub mode and the inbound-SMS webhook accepts unsigned requests — the suite
// exercises real fanout without any paid provider call.

import { execFileSync, spawn } from 'node:child_process';

import { TEST_ROUTES_SECRET, EMAIL_WEBHOOK_SECRET } from '../../e2e/test-config.mjs';

const HOST = '127.0.0.1';
const PORT = 8788;

const wranglerCli = 'node_modules/wrangler/bin/wrangler.js';

function run(cmd, args) {
	execFileSync(cmd, args, { stdio: 'inherit' });
}

console.log('[e2e] building production output…');
run('npm', ['run', 'build']);

console.log('[e2e] applying D1 migrations to the local database…');
run('node', [wranglerCli, 'd1', 'migrations', 'apply', 'household-hub-db', '--local']);

console.log(`[e2e] starting wrangler pages dev on http://${HOST}:${PORT}…`);
const wrangler = spawn(
	'node',
	[
		wranglerCli,
		'pages',
		'dev',
		'.svelte-kit/cloudflare',
		'--ip',
		HOST,
		'--port',
		String(PORT),
		'--binding',
		`TEST_ROUTES_SECRET=${TEST_ROUTES_SECRET}`,
		'--binding',
		`EMAIL_WEBHOOK_SECRET=${EMAIL_WEBHOOK_SECRET}`
	],
	{ stdio: 'inherit' }
);

function shutdown(signal) {
	if (!wrangler.killed) wrangler.kill('SIGTERM');
	process.exit(signal === 'exit' ? 0 : 0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
wrangler.on('exit', (code) => process.exit(code ?? 0));
