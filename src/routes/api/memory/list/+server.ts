import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, factsByPredicate } from '$lib/server/db';

// GET /api/memory/list?personId=<id>&predicate=<p> — a household list (M76):
// the confirmed memory facts with a given predicate. The default predicate
// `needs` is the shopping list — each fact's object is one item to get.
// Adult-gated. New items are added through POST /api/memory/facts.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const predicate = url.searchParams.get('predicate')?.trim() || 'needs';
	return json(await factsByPredicate(db, predicate));
};
