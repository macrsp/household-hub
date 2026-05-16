import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { updateParticipantPrefs } from '$lib/server/db';
import { DELIVERY_PREFERENCES, isDeliveryPreference, type DeliveryPreference } from '$lib/preferences';

interface ParticipantRow {
	conversation_id: string;
	person_id: string;
	muted: number;
	delivery_preference: string;
}

// Resolve a participant row from a conversation slug + person id, or 404.
async function resolveParticipant(
	db: D1Database,
	slug: string,
	personId: string
): Promise<ParticipantRow> {
	const row = await db
		.prepare(
			`SELECT p.conversation_id AS conversation_id, p.person_id AS person_id,
			        p.muted AS muted, p.delivery_preference AS delivery_preference
			 FROM participants p
			 JOIN conversations c ON c.id = p.conversation_id
			 WHERE c.slug = ? AND p.person_id = ?`
		)
		.bind(slug, personId)
		.first<ParticipantRow>();
	if (!row) throw error(404, `No participant ${personId} in conversation ${slug}`);
	return row;
}

function view(row: ParticipantRow) {
	return { muted: row.muted === 1, delivery_preference: row.delivery_preference };
}

// GET — the participant's current notification preferences.
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);
	return json(view(await resolveParticipant(db, params.slug, params.personId)));
};

// PUT — update `muted` and/or `delivery_preference` for this participant.
// Body: { muted?: boolean, delivery_preference?: "all" | "app_only" }.
export const PUT: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);
	const row = await resolveParticipant(db, params.slug, params.personId);

	const raw = (await request.json().catch(() => null)) as
		| { muted?: unknown; delivery_preference?: unknown }
		| null;
	if (!raw || typeof raw !== 'object') throw error(400, 'Expected a JSON object body');

	const prefs: { muted?: boolean; delivery_preference?: DeliveryPreference } = {};
	if (raw.muted !== undefined) {
		if (typeof raw.muted !== 'boolean') throw error(400, 'muted must be a boolean');
		prefs.muted = raw.muted;
	}
	if (raw.delivery_preference !== undefined) {
		if (!isDeliveryPreference(raw.delivery_preference)) {
			throw error(400, `delivery_preference must be one of: ${DELIVERY_PREFERENCES.join(', ')}`);
		}
		prefs.delivery_preference = raw.delivery_preference;
	}

	await updateParticipantPrefs(db, row.conversation_id, row.person_id, prefs);
	return json(view(await resolveParticipant(db, params.slug, params.personId)));
};
