import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { createPersonWithParticipants, listPeopleWithEndpoints } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// GET /api/people — every household member with their endpoints attached.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	return json(await listPeopleWithEndpoints(db));
};

// POST /api/people — add a household member. Body: { displayName: string }.
// The new member is added as a participant to every existing conversation, so
// they take part in the household's relay from the moment they are created.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { displayName?: unknown } | null;
	const displayName = typeof raw?.displayName === 'string' ? raw.displayName.trim() : '';
	if (displayName === '') {
		throw error(400, 'Expected JSON body { displayName: non-empty string }');
	}

	const person = { id: crypto.randomUUID(), display_name: displayName, created_at: nowIso() };
	const { results: conversations } = await db
		.prepare('SELECT id FROM conversations')
		.all<{ id: string }>();
	await createPersonWithParticipants(
		db,
		person,
		conversations.map((c) => c.id)
	);

	return json({ id: person.id, display_name: person.display_name }, { status: 201 });
};
