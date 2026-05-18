import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { embedText } from '$lib/server/embeddings';

// How many nearest vectors to retrieve, and the minimum cosine score a match
// must clear to be shown — below this the result is more noise than signal.
const TOP_K = 20;
const MIN_SCORE = 0.4;

// GET /api/search/semantic?q=<query>&slug=<conversation?> — meaning-based
// message search backed by Cloudflare Vectorize (M66). The query text is
// embedded with Workers AI and matched against the message-vector index;
// `?slug=` scopes the search to one conversation (its Vectorize namespace),
// and its absence searches the whole household.
//
// Gated like the other AI features: with no Workers AI or Vectorize binding
// (local/CI), or if the query fails, it returns 503 { available: false }.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const q = url.searchParams.get('q')?.trim();
	if (!q) throw error(400, 'A search term (?q=) is required');

	// An optional conversation scope — resolved to its Vectorize namespace.
	const slug = url.searchParams.get('slug')?.trim();
	let namespace: string | undefined;
	if (slug) {
		const conv = await db
			.prepare('SELECT id FROM conversations WHERE slug = ?')
			.bind(slug)
			.first<{ id: string }>();
		if (!conv) throw error(404, `Unknown conversation: ${slug}`);
		namespace = conv.id;
	}

	const ai = platform?.env.AI;
	const index = platform?.env.VECTORIZE;
	if (!ai || !index) {
		return json({ available: false, results: [] }, { status: 503 });
	}

	let ranked: { id: string; score: number }[];
	try {
		const vector = await embedText(ai, q);
		if (!vector) return json({ available: false, results: [] }, { status: 503 });
		const res = await index.query(vector, {
			topK: TOP_K,
			...(namespace ? { namespace } : {})
		});
		ranked = (res.matches ?? [])
			.filter((m) => m.score >= MIN_SCORE)
			.map((m) => ({ id: m.id, score: m.score }));
	} catch (e) {
		console.error('[semantic] query failed', e);
		return json({ available: false, results: [] }, { status: 503 });
	}

	if (ranked.length === 0) {
		return json({ available: true, results: [] });
	}

	// Fetch the matched messages from D1 — the canonical store. A message
	// deleted since it was indexed simply does not come back here, so the
	// stale vector is filtered out without needing to prune the index.
	const ids = ranked.map((m) => m.id);
	const placeholders = ids.map(() => '?').join(',');
	const { results } = await db
		.prepare(
			`SELECT m.id, m.body, m.source_transport, m.created_at,
			        m.author_person_id, p.display_name AS author_name,
			        c.slug AS conversation_slug, c.name AS conversation_name
			 FROM messages m
			 JOIN people p ON p.id = m.author_person_id
			 JOIN conversations c ON c.id = m.conversation_id
			 WHERE m.deleted_at IS NULL AND m.id IN (${placeholders})`
		)
		.bind(...ids)
		.all<Record<string, unknown>>();

	// Re-order to Vectorize's relevance ranking and attach the score.
	const scoreById = new Map(ranked.map((m) => [m.id, m.score]));
	const byId = new Map(results.map((r) => [r.id as string, r]));
	const ordered = ids
		.map((id) => byId.get(id))
		.filter((r): r is Record<string, unknown> => r !== undefined)
		.map((r) => ({ ...r, score: scoreById.get(r.id as string) ?? 0 }));

	return json({ available: true, results: ordered });
};
