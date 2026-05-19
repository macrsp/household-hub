import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult } from '$lib/server/db';
import { extractFlyerFacts } from '$lib/server/flyer-extract';

// Flyer photos larger than this are rejected — a phone photo is well under it.
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// POST /api/memory/flyer?personId=<id> — scan a photographed flyer (M80). The
// request body is the raw image bytes; a Workers AI vision model reads it and
// any events become proposed memory facts for review. Adult-gated. The image
// is processed transiently and never stored. Returns { available, proposed }.
//
// Gated like the other AI features: with no Workers AI binding it returns 503.
export const POST: RequestHandler = async ({ platform, request, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const buf = await request.arrayBuffer();
	if (buf.byteLength === 0) {
		throw error(400, 'Expected an image in the request body');
	}
	if (buf.byteLength > MAX_IMAGE_BYTES) {
		throw error(413, 'Image too large — keep it under 6 MB');
	}

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, proposed: 0 }, { status: 503 });
	}

	const proposed = await extractFlyerFacts(platform!.env, new Uint8Array(buf));
	return json({ available: true, proposed });
};
