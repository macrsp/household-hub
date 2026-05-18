/// <reference types="@cloudflare/workers-types" />
//
// Household-memory fact index (M72). Confirmed facts are embedded with Workers
// AI and stored in the `household-hub-facts` Vectorize index, so a
// plain-language question can retrieve the facts most relevant to it. It is
// the memory-graph counterpart of semantic-index.ts (which indexes messages).

import { embedText } from './embeddings';

// Render a fact as a short sentence to embed. Predicates are snake_case in the
// graph; spaces read more naturally to the embedding model.
export function factSentence(subject: string, predicate: string, object: string): string {
	return `${subject}: ${predicate.replace(/_/g, ' ')} is ${object}`;
}

// Index one fact into the facts index, keyed by fact id (so a re-index after
// an edit overwrites). Best-effort and self-gating: a no-op when Workers AI or
// the facts index is absent (local/CI).
export async function indexFact(
	env: App.Platform['env'],
	factId: string,
	sentence: string
): Promise<void> {
	const ai = env.AI;
	const index = env.VECTORIZE_FACTS;
	if (!ai || !index) return;
	try {
		const vector = await embedText(ai, sentence);
		if (!vector) return;
		await index.upsert([{ id: factId, values: vector }]);
	} catch (e) {
		console.error('[memory] index failed for fact', factId, e);
	}
}

// Retrieve the ids of up to `topK` facts most relevant to `query`.
// Best-effort: returns [] when Workers AI or the facts index is absent, or on
// failure — the caller then answers from whatever facts it has otherwise.
export async function relevantFactIds(
	env: App.Platform['env'],
	query: string,
	topK = 15
): Promise<string[]> {
	const ai = env.AI;
	const index = env.VECTORIZE_FACTS;
	if (!ai || !index) return [];
	try {
		const vector = await embedText(ai, query);
		if (!vector) return [];
		const res = await index.query(vector, { topK });
		return (res.matches ?? []).map((m) => m.id);
	} catch (e) {
		console.error('[memory] fact retrieval failed', e);
		return [];
	}
}
