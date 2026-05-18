import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, rejectProposedFact } from '$lib/server/db';

// POST /api/memory/facts/[id]/reject — reject (delete) a proposed fact (M73).
// Body: { personId }. Adult-gated. Only a proposed fact can be rejected; a
// confirmed fact is never removed by this path. Returns { rejected: boolean }.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { personId?: unknown } | null;
	const personId = typeof raw?.personId === 'string' ? raw.personId : '';
	if (personId === '') throw error(400, 'Expected JSON body { personId }');
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const rejected = await rejectProposedFact(db, params.id);
	return json({ rejected });
};
