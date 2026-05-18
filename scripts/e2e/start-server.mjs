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
//
// `wrangler pages dev` runs against a *generated* config in a temp directory
// that omits the Workers AI binding (M54). With the `ai` binding present,
// `wrangler pages dev` would try to open a remote proxy session to Cloudflare
// Workers AI, which needs account auth the CI runner does not have. With it
// absent, `event.platform.env.AI` is undefined and the summary route reports
// itself unavailable (503) — exactly what its E2E test asserts. The real
// `wrangler.jsonc` (which production deploys use) is never modified; D1 local
// state is shared with the migration step via `--persist-to`.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { TEST_ROUTES_SECRET, EMAIL_WEBHOOK_SECRET } from '../../e2e/test-config.mjs';

const HOST = '127.0.0.1';
const PORT = 8788;

const REPO = process.cwd();
const wranglerCli = resolve(REPO, 'node_modules/wrangler/bin/wrangler.js');
const BUILD_DIR = resolve(REPO, '.svelte-kit/cloudflare');
const STATE_DIR = resolve(REPO, '.wrangler/state');

function run(cmd, args, opts = {}) {
	execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

console.log('[e2e] building production output…');
run('npm', ['run', 'build']);

console.log('[e2e] applying D1 migrations to the local database…');
run('node', [
	wranglerCli,
	'd1',
	'migrations',
	'apply',
	'household-hub-db',
	'--local',
	'--persist-to',
	STATE_DIR
]);

// Generate a wrangler config without the `ai` binding (and without
// `pages_build_output_dir`, since the build dir is passed positionally) into
// a temp directory; `wrangler pages dev` runs with that directory as its cwd.
const e2eConfig = readFileSync(resolve(REPO, 'wrangler.jsonc'), 'utf8')
	.replace(/,\s*(?:\/\/[^\n]*\n\s*)*"ai"\s*:\s*\{[^}]*\}/, '')
	.replace(/\s*"pages_build_output_dir"\s*:\s*"[^"]*"\s*,/, '');
const configDir = mkdtempSync(join(tmpdir(), 'hh-e2e-'));
writeFileSync(join(configDir, 'wrangler.jsonc'), e2eConfig);

console.log(`[e2e] starting wrangler pages dev on http://${HOST}:${PORT}…`);
const wrangler = spawn(
	'node',
	[
		wranglerCli,
		'pages',
		'dev',
		BUILD_DIR,
		'--ip',
		HOST,
		'--port',
		String(PORT),
		'--persist-to',
		STATE_DIR,
		'--binding',
		`TEST_ROUTES_SECRET=${TEST_ROUTES_SECRET}`,
		'--binding',
		`EMAIL_WEBHOOK_SECRET=${EMAIL_WEBHOOK_SECRET}`
	],
	{ cwd: configDir, stdio: 'inherit' }
);

function shutdown() {
	if (!wrangler.killed) wrangler.kill('SIGTERM');
	process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
wrangler.on('exit', (code) => process.exit(code ?? 0));
