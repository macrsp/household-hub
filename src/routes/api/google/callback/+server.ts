import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, upsertGoogleAccount } from '$lib/server/db';
import {
	googleConfigured,
	verifyState,
	exchangeCode,
	gmailProfile,
	encryptToken
} from '$lib/server/google';
import { nowIso } from '$lib/server/time';

// GET /api/google/callback — Google redirects here after the consent screen
// (M74). It verifies the signed `state`, exchanges the authorization code for
// tokens, reads the mailbox's address to confirm the Gmail scope works, and
// stores an encrypted `google_accounts` row. It always ends by redirecting
// back to /household with a ?gmail= status the page can show.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);
	const env = platform!.env;

	if (!googleConfigured(env)) {
		throw error(503, 'The Gmail connection is not configured.');
	}

	// The member declined or aborted at Google's consent screen.
	if (url.searchParams.get('error')) {
		throw redirect(302, '/household?gmail=denied');
	}

	const code = url.searchParams.get('code') ?? '';
	const state = url.searchParams.get('state') ?? '';
	if (code === '' || state === '') {
		throw error(400, 'Missing OAuth code or state.');
	}

	const personId = await verifyState(env.GOOGLE_CLIENT_SECRET as string, state);
	if (!personId || !(await isAdult(db, personId))) {
		throw error(403, 'Invalid or expired connection request.');
	}

	try {
		const tokens = await exchangeCode(env, code);
		// Without a refresh token the connection cannot be kept alive.
		if (!tokens.refresh_token) throw new Error('Google returned no refresh token');

		// Reading the profile both names the mailbox and confirms the
		// gmail.readonly scope is actually granted.
		const profile = await gmailProfile(tokens.access_token);
		const key = env.TOKEN_ENCRYPTION_KEY as string;

		await upsertGoogleAccount(db, {
			id: crypto.randomUUID(),
			person_id: personId,
			email: profile.emailAddress,
			access_token: await encryptToken(key, tokens.access_token),
			refresh_token: await encryptToken(key, tokens.refresh_token),
			token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
			history_id: profile.historyId ?? null,
			created_at: nowIso()
		});
	} catch (e) {
		console.error('[google] callback failed', e);
		throw redirect(302, '/household?gmail=error');
	}

	throw redirect(302, '/household?gmail=connected');
};
