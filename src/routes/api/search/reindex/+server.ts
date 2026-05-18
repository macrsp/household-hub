import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { indexMessages, type IndexableMessage } from '$lib/server/semantic-index';

// How many recent messages a single reindex call embeds and upserts.
const REINDEX_LIMIT = 500;

// POST /api/search/reindex — (re)build the semantic-search index from the
// canonical messages table (M66). Embeds the most recent messages and upserts
// them into Vectorize. Idempotent: vectors are keyed by message id, so a
// repeat call simply overwrites. Used to backfill messages that predate the
// index, or after the index is recreated.
//
// Gated like semantic search: with no Workers AI or Vectorize binding it
// returns 503 { available: false } and indexes nothing.
export const POST: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	if (!platform?.env.AI || !platform?.env.VECTORIZE) {
		return json({ available: false, indexed: 0 }, { status: 503 });
	}

	const { results } = await db
		.prepare(
			`SELECT id, body, conversation_id FROM messages
			 WHERE deleted_at IS NULL
			 ORDER BY created_at DESC
			 LIMIT ${REINDEX_LIMIT}`
		)
		.all<IndexableMessage>();

	const indexed = await indexMessages(platform.env, results);
	return json({ available: true, indexed, scanned: results.length });
};
