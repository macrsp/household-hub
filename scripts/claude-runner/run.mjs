#!/usr/bin/env node
//
// household-hub dev-channel runner (M53).
//
// Polls the #claude channel for new change requests and runs Claude Code on
// each one, then posts the result back into the channel. Run it on a cron on
// a host you control — household-hub itself (Cloudflare Pages) cannot run
// Claude Code. See README.md in this directory for setup.
//
// Configuration (environment variables):
//   HOUSEHOLD_HUB_URL   Base URL of the app.
//                       Default: https://household.practicepartner.app
//   HH_REPO_DIR         Absolute path to a clone of the household-hub repo
//                       the runner builds in. Default: the repo this script
//                       lives in.
//   CLAUDE_REQUESTERS   Comma-separated person ids allowed to trigger a
//                       build, or "all". Default: all.
//   MAX_REQUESTS        Most requests to handle per run — a cost cap.
//                       Default: 1.
//   ANTHROPIC_API_KEY   Consumed by the `claude` CLI itself.
//   CLOUDFLARE_API_TOKEN  Consumed by `wrangler` when Claude Code deploys.
//
// State: the id and timestamp of the last handled request are stored in
// scripts/claude-runner/.runner-state.json (git-ignored). On the very first
// run with no state, the runner adopts "now" as its cursor and handles no
// backlog.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(HERE, '.runner-state.json');

const HUB_URL = (process.env.HOUSEHOLD_HUB_URL ?? 'https://household.practicepartner.app').replace(
	/\/$/,
	''
);
const REPO_DIR = resolve(process.env.HH_REPO_DIR ?? resolve(HERE, '../..'));
const REQUESTERS = (process.env.CLAUDE_REQUESTERS ?? 'all').trim();
const MAX_REQUESTS = Math.max(1, Number(process.env.MAX_REQUESTS ?? '1') || 1);

const CHANNEL = 'claude'; // the #claude conversation slug
const CLAUDE_PERSON_ID = 'person-claude';

function log(...args) {
	console.log(`[claude-runner ${new Date().toISOString()}]`, ...args);
}

function loadState() {
	if (!existsSync(STATE_FILE)) return null;
	try {
		return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
	} catch {
		return null;
	}
}

function saveState(state) {
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// Post a message into the #claude channel as the Claude Code member.
async function postToChannel(body) {
	const res = await fetch(`${HUB_URL}/api/conversations/${CHANNEL}/messages`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ authorPersonId: CLAUDE_PERSON_ID, body })
	});
	if (!res.ok) {
		log(`WARNING: could not post to #${CHANNEL} (HTTP ${res.status})`);
	}
}

// Fetch request messages newer than the cursor: human-authored (not Claude),
// and — unless CLAUDE_REQUESTERS is "all" — from an allowlisted person.
async function fetchNewRequests(sinceIso) {
	const url = new URL(`${HUB_URL}/api/conversations/${CHANNEL}/messages`);
	url.searchParams.set('since', sinceIso);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`messages fetch failed: HTTP ${res.status}`);
	const messages = await res.json();

	const allowed =
		REQUESTERS === 'all' ? null : new Set(REQUESTERS.split(',').map((s) => s.trim()));
	return messages.filter((m) => {
		if (m.author_person_id === CLAUDE_PERSON_ID) return false; // Claude's own posts
		if (m.deleted_at) return false;
		if (allowed && !allowed.has(m.author_person_id)) return false;
		return true;
	});
}

// The instruction Claude Code receives for one request.
function buildPrompt(request) {
	return [
		`A household member posted this request in household-hub's #claude dev`,
		`channel. Implement it as a change to this repository.`,
		``,
		`REQUEST FROM ${request.author_name}:`,
		request.body,
		``,
		`Follow CLAUDE.md and .agent/PLANS.md. Work on a new branch, run the`,
		`gates (npm run check, npm run build, npm run test:unit, and npm run`,
		`test:e2e when the change is user-facing), open a PR, wait for CI, merge`,
		`it once green, and deploy. You are running autonomously via the`,
		`dev-channel runner and are authorized to merge your own green PR and`,
		`deploy. If the request is unclear, infeasible, or unsafe, do NOT change`,
		`code — explain why instead.`,
		``,
		`End with a 1-3 sentence summary of what you did (or why you didn't),`,
		`written to be posted back to the family in the chat channel.`
	].join('\n');
}

// Run Claude Code headless on one request; return its final result text.
function runClaude(request) {
	execFileSync('git', ['switch', 'main'], { cwd: REPO_DIR, stdio: 'inherit' });
	execFileSync('git', ['pull', '--ff-only'], { cwd: REPO_DIR, stdio: 'inherit' });

	const result = spawnSync(
		'claude',
		['-p', buildPrompt(request), '--output-format', 'json', '--dangerously-skip-permissions'],
		{ cwd: REPO_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);
	if (result.status !== 0) {
		throw new Error(`claude exited ${result.status}: ${(result.stderr || '').slice(0, 500)}`);
	}
	try {
		const parsed = JSON.parse(result.stdout);
		return (parsed.result ?? '').trim() || 'Claude Code finished but produced no summary.';
	} catch {
		// Not JSON — fall back to the raw output.
		return result.stdout.trim().slice(0, 2000) || 'Claude Code finished.';
	}
}

async function main() {
	const state = loadState();
	let cursor = state?.cursor ?? new Date().toISOString();
	if (!state) {
		log('first run — adopting "now" as the cursor; no backlog will be handled');
		saveState({ cursor });
		return;
	}

	let requests;
	try {
		requests = await fetchNewRequests(cursor);
	} catch (err) {
		log('ERROR fetching requests:', err.message);
		process.exit(1);
	}

	if (requests.length === 0) {
		log('no new requests');
		return;
	}
	log(`${requests.length} new request(s); handling up to ${MAX_REQUESTS}`);

	for (const request of requests.slice(0, MAX_REQUESTS)) {
		log(`handling request ${request.id} from ${request.author_name}`);
		await postToChannel(`🛠️ On it — working on: "${request.body.slice(0, 120)}"`);
		try {
			const summary = runClaude(request);
			await postToChannel(`✅ ${summary}`);
		} catch (err) {
			log('ERROR running Claude Code:', err.message);
			await postToChannel(
				`⚠️ I hit a problem with that request and made no changes: ${err.message.slice(0, 300)}`
			);
		}
		// Advance the cursor past this request whether it succeeded or not, so
		// a failing request is not retried forever.
		cursor = request.created_at;
		saveState({ cursor });
	}

	log('done');
}

main();
