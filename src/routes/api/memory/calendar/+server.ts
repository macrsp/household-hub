import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, datedFacts } from '$lib/server/db';

// GET /api/memory/calendar?personId=<id> — the household calendar (M76): the
// confirmed memory facts that carry a date, earliest first. A calendar event
// is simply a fact with a `valid_at`. Adult-gated.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	return json(await datedFacts(db));
};
