/// <reference types="@cloudflare/workers-types" />
//
// Semantic search index (M66). Embeds message bodies with Workers AI and
// stores them in the `household-hub-messages` Cloudflare Vectorize index,
// keyed by message id and namespaced by conversation so a search can be scoped
// to one thread (namespace) or run household-wide (no namespace).

import { embedText, embedTexts } from './embeddings';
import type { Message } from './db';

// A message reduced to what the index needs.
export interface IndexableMessage {
	id: string;
	body: string;
	conversation_id: string;
}

// Index one message into Vectorize. Best-effort and self-gating: a no-op when
// Workers AI or the Vectorize binding is absent (local/CI), or the body is
// empty. Intended to run via `waitUntil` so it never delays a send.
export async function indexMessage(env: App.Platform['env'], message: Message): Promise<void> {
	const ai = env.AI;
	const index = env.VECTORIZE;
	if (!ai || !index) return;
	const body = message.body.trim();
	if (body === '') return;
	try {
		const vector = await embedText(ai, body);
		if (!vector) return;
		await index.upsert([
			{ id: message.id, values: vector, namespace: message.conversation_id }
		]);
	} catch (e) {
		console.error('[semantic] index failed for message', message.id, e);
	}
}

// Index a batch of messages (the reindex backfill). Returns the number of
// vectors upserted. A no-op returning 0 when AI or Vectorize is absent.
export async function indexMessages(
	env: App.Platform['env'],
	messages: IndexableMessage[]
): Promise<number> {
	const ai = env.AI;
	const index = env.VECTORIZE;
	if (!ai || !index) return 0;

	const usable = messages
		.map((m) => ({ ...m, body: m.body.trim() }))
		.filter((m) => m.body !== '');
	if (usable.length === 0) return 0;

	const vectors = await embedTexts(
		ai,
		usable.map((m) => m.body)
	);
	const upserts = usable
		.map((m, i) => ({ id: m.id, values: vectors[i], namespace: m.conversation_id }))
		.filter((v): v is { id: string; values: number[]; namespace: string } =>
			Array.isArray(v.values)
		);
	if (upserts.length === 0) return 0;
	await index.upsert(upserts);
	return upserts.length;
}

// Retrieve the ids of up to `topK` messages most semantically relevant to
// `query`, within one conversation's namespace (M68). Best-effort: returns []
// when Workers AI or Vectorize is absent, or on failure — the caller then
// falls back to a plain recent-message window.
export async function relevantMessageIds(
	env: App.Platform['env'],
	conversationId: string,
	query: string,
	topK = 12
): Promise<string[]> {
	const ai = env.AI;
	const index = env.VECTORIZE;
	if (!ai || !index) return [];
	try {
		const vector = await embedText(ai, query);
		if (!vector) return [];
		const res = await index.query(vector, { topK, namespace: conversationId });
		return (res.matches ?? []).map((m) => m.id);
	} catch (e) {
		console.error('[semantic] retrieval failed', e);
		return [];
	}
}
