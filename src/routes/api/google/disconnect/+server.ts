import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, getGoogleAccount, deleteGoogleAccount } from '$lib/server/db';
import { googleConfigured, decryptToken, revokeToken } from '$lib/server/google';

// POST /api/google/disconnect — disconnect a connected Gmail account (M74).
// Body: { personId, accountId }. Adult-gated; a member can only disconnect an
// account they connected. The refresh token is revoked at Google (best-effort)
// before the row — and its encrypted tokens — are deleted.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);
	const env = platform!.env;

	const raw = (await request.json().catch(() => null)) as
		| { personId?: unknown; accountId?: unknown }
		| null;
	const personId = typeof raw?.personId === 'string' ? raw.personId : '';
	const accountId = typeof raw?.accountId === 'string' ? raw.accountId : '';
	if (personId === '' || accountId === '') {
		throw error(400, 'Expected JSON body { personId, accountId }');
	}
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	// Revoke at Google first — best-effort, so a revoke failure still lets the
	// local row be deleted.
	const account = await getGoogleAccount(db, accountId);
	if (account && account.person_id === personId && googleConfigured(env)) {
		try {
			const refresh = await decryptToken(
				env.TOKEN_ENCRYPTION_KEY as string,
				account.refresh_token
			);
			await revokeToken(refresh);
		} catch (e) {
			console.error('[google] revoke on disconnect failed', e);
		}
	}

	const disconnected = await deleteGoogleAccount(db, accountId, personId);
	return json({ disconnected });
};
