import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult } from '$lib/server/db';
import { googleConfigured, signState, buildAuthUrl } from '$lib/server/google';

// GET /api/google/connect?personId=<id> — begin the Gmail OAuth flow (M74).
// Adult-gated. Redirects the member to Google's consent screen with a signed
// `state` that carries their id through the round trip. With the Google
// secrets unconfigured (local/CI) it returns 503.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);
	const env = platform!.env;

	if (!googleConfigured(env)) {
		throw error(503, 'The Gmail connection is not configured.');
	}

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Connecting Gmail is available to adult members only.');
	}

	const state = await signState(env.GOOGLE_CLIENT_SECRET as string, personId);
	throw redirect(302, buildAuthUrl(env, state));
};
