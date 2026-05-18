import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult, confirmFact, factWithNames } from '$lib/server/db';
import { indexFact, factSentence } from '$lib/server/memory-index';

// POST /api/memory/facts/[id]/confirm — confirm a proposed fact (M73). Body:
// { personId }. Adult-gated. A confirmed fact becomes answerable and is
// embedded for semantic recall. Returns { confirmed: boolean } — false when
// the fact was already confirmed or does not exist.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { personId?: unknown } | null;
	const personId = typeof raw?.personId === 'string' ? raw.personId : '';
	if (personId === '') throw error(400, 'Expected JSON body { personId }');
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const confirmed = await confirmFact(db, params.id, personId);
	if (!confirmed) {
		return json({ confirmed: false });
	}

	// Index the now-confirmed fact for semantic recall — best-effort.
	const fact = await factWithNames(db, params.id);
	if (fact) {
		const object = fact.object_text ?? fact.object_name ?? '';
		const indexTask = indexFact(
			platform!.env,
			fact.id,
			factSentence(fact.subject_name, fact.predicate, object)
		);
		if (platform?.context?.waitUntil) platform.context.waitUntil(indexTask);
		else await indexTask;
	}

	return json({ confirmed: true });
};
