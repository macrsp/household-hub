import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, listGoogleAccountsSafe } from '$lib/server/db';

// GET /api/google/accounts?personId=<id> — the connected Gmail accounts (M74),
// without any token columns. Adult-gated.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	return json(await listGoogleAccountsSafe(db));
};
