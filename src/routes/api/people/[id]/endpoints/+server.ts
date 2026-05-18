import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertEndpoint, ENDPOINT_TYPES, type EndpointType } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// POST /api/people/[id]/endpoints — add an endpoint (an address on a
// transport) to a household member. Body: { type, address }.
// `type` must be one of the declared ENDPOINT_TYPES; a duplicate (type,
// address) pair is a 409.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { type?: unknown; address?: unknown }
		| null;
	const type = raw?.type;
	const address = typeof raw?.address === 'string' ? raw.address.trim() : '';

	if (typeof type !== 'string' || !(ENDPOINT_TYPES as readonly string[]).includes(type)) {
		throw error(400, `type must be one of: ${ENDPOINT_TYPES.join(', ')}`);
	}
	if (address === '') {
		throw error(400, 'address is required');
	}
	// Light per-transport shape checks — the canonical guard is the schema's
	// UNIQUE(type, address) constraint.
	if (type === 'sms') {
		const digits = address.replace(/\D/g, '');
		if (digits.length < 10 || digits.length > 15) {
			throw error(400, 'An SMS endpoint needs a valid phone number');
		}
	}
	if (type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
		throw error(400, 'An email endpoint needs a valid email address');
	}

	const person = await db
		.prepare('SELECT id FROM people WHERE id = ?')
		.bind(params.id)
		.first<{ id: string }>();
	if (!person) throw error(404, `Unknown person: ${params.id}`);

	// Reject a duplicate (type, address) before the insert — the schema's
	// UNIQUE constraint is the backstop.
	const existing = await db
		.prepare('SELECT id FROM endpoints WHERE type = ? AND address = ?')
		.bind(type, address)
		.first<{ id: string }>();
	if (existing) throw error(409, `That ${type} address is already registered`);

	const endpoint = {
		id: crypto.randomUUID(),
		person_id: params.id,
		type: type as EndpointType,
		address,
		created_at: nowIso()
	};
	await insertEndpoint(db, endpoint);

	return json({ id: endpoint.id, type: endpoint.type, address: endpoint.address }, { status: 201 });
};
