/// <reference types="@cloudflare/workers-types" />
//
// Workers AI text embeddings (M66). Wraps the bge embedding model used to turn
// message text into vectors for semantic search. The model produces 768-dim
// vectors — the dimension the `household-hub-messages` Vectorize index was
// created with.

const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
// The model accepts a batch of texts per call; chunk larger inputs.
const EMBED_BATCH = 100;

// Embed one or more texts. Returns one vector per input, in input order.
export async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
	const out: number[][] = [];
	for (let i = 0; i < texts.length; i += EMBED_BATCH) {
		const chunk = texts.slice(i, i + EMBED_BATCH);
		const result = (await ai.run(EMBED_MODEL, { text: chunk })) as { data?: number[][] };
		out.push(...(result.data ?? []));
	}
	return out;
}

// Embed a single text, or null if the model returned nothing.
export async function embedText(ai: Ai, text: string): Promise<number[] | null> {
	const [vector] = await embedTexts(ai, [text]);
	return vector ?? null;
}
