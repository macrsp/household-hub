/// <reference types="@cloudflare/workers-types" />
//
// Gmail ingestion (M75). Reads recent email from each connected account and
// runs the household-fact extraction on it. Raw email is never stored — only
// the proposed facts, plus each email's id as a fact `source_ref` so the same
// email is not processed twice.

import {
	freshAccessToken,
	listRecentMessageIds,
	getMessage,
	messageText
} from './google';
import { factExistsForRef, type GoogleAccountRow } from './db';
import { extractEmailFacts } from './memory-extract';

/**
 * Run a per-account sync over every connected account. Each account is wrapped
 * in its own try/catch, so one account's failure (an expired token, a Gmail
 * outage) never aborts the others — PLANS.md invariant two. `syncOne` is
 * injected so this loop policy can be unit-tested without Gmail.
 */
export async function syncAllAccounts<T>(
	accounts: T[],
	syncOne: (account: T) => Promise<number>
): Promise<{ ok: number; failed: number; proposed: number }> {
	let ok = 0;
	let failed = 0;
	let proposed = 0;
	for (const account of accounts) {
		try {
			proposed += await syncOne(account);
			ok += 1;
		} catch (e) {
			console.error('[gmail-sync] account sync failed', e);
			failed += 1;
		}
	}
	return { ok, failed, proposed };
}

/**
 * Sync one connected account: list the last day's messages, skip any already
 * processed (a fact already carries that email's id), and extract household
 * facts from the rest. Returns the count of proposed facts.
 */
export async function syncOneAccount(
	env: App.Platform['env'],
	db: D1Database,
	account: GoogleAccountRow
): Promise<number> {
	const accessToken = await freshAccessToken(env, db, account);
	const ids = await listRecentMessageIds(accessToken);

	let proposed = 0;
	for (const id of ids) {
		if (await factExistsForRef(db, id)) continue; // already processed
		const message = await getMessage(accessToken, id);
		const text = messageText(message);
		if (text.trim() === '') continue;
		proposed += await extractEmailFacts(env, text, id);
	}
	return proposed;
}
