import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { updatePersonName } from '$lib/server/db';

// PATCH /api/people/[id] — rename a household member. Body: { displayName }.
export const PATCH: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { displayName?: unknown } | null;
	const displayName = typeof raw?.displayName === 'string' ? raw.displayName.trim() : '';
	if (displayName === '') {
		throw error(400, 'Expected JSON body { displayName: non-empty string }');
	}

	const person = await db
		.prepare('SELECT id FROM people WHERE id = ?')
		.bind(params.id)
		.first<{ id: string }>();
	if (!person) throw error(404, `Unknown person: ${params.id}`);

	await updatePersonName(db, params.id, displayName);
	return json({ id: params.id, display_name: displayName });
};
