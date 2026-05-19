import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { googleConfigured } from '$lib/server/google';
import { listGoogleAccounts } from '$lib/server/db';
import { syncAllAccounts, syncOneAccount } from '$lib/server/gmail-sync';

// POST /api/google/sync — read recent email from every connected Gmail account
// and propose household-memory facts from it (M75). Built to be called once a
// day by a cron on the operator's runner host.
//
// When DIGEST-style `GMAIL_SYNC_SECRET` is configured, a matching
// X-Webhook-Secret header is required; absent (local/dev) the check is skipped
// — the same optional-secret pattern as the digest poster and email webhook.
// With no Google configuration it returns 503 and reads nothing. Raw email is
// never stored; only proposed facts are.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);
	const env = platform!.env;

	const expectedSecret = env.GMAIL_SYNC_SECRET;
	if (expectedSecret && (request.headers.get('x-webhook-secret') ?? '') !== expectedSecret) {
		return text('Invalid or missing webhook secret', { status: 403 });
	}

	if (!googleConfigured(env)) {
		return json({ ok: 0, failed: 0, proposed: 0, reason: 'gmail-unconfigured' }, { status: 503 });
	}

	const accounts = await listGoogleAccounts(db);
	const result = await syncAllAccounts(accounts, (account) =>
		syncOneAccount(env, db, account)
	);

	return json({ accounts: accounts.length, ...result });
};
