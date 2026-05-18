import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, proposedFactsWithNames } from '$lib/server/db';

// GET /api/memory/proposed?personId=<id> — the facts the AI has proposed from
// conversations or email and that are awaiting a member's confirmation (M73).
// Adult-gated like the rest of /api/memory.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	return json(await proposedFactsWithNames(db));
};
