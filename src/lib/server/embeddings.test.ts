import { describe, it, expect } from 'vitest';
import { embedTexts, embedText } from './embeddings';

// A stub Workers AI that returns a tiny vector per input text and records how
// many times it was called, so the batching can be checked.
function stubAi() {
	const calls: number[] = [];
	const ai = {
		run: async (_model: string, opts: { text: string[] }) => {
			calls.push(opts.text.length);
			return { data: opts.text.map((_, i) => [i, i]) };
		}
	};
	return { ai: ai as unknown as Ai, calls };
}

describe('embedTexts', () => {
	it('returns one vector per input', async () => {
		const { ai } = stubAi();
		const out = await embedTexts(ai, ['a', 'b', 'c']);
		expect(out).toHaveLength(3);
	});

	it('chunks inputs larger than the batch size into multiple calls', async () => {
		const { ai, calls } = stubAi();
		const out = await embedTexts(ai, Array.from({ length: 250 }, (_, i) => `t${i}`));
		expect(out).toHaveLength(250);
		expect(calls).toEqual([100, 100, 50]);
	});

	it('returns an empty array for no input', async () => {
		const { ai, calls } = stubAi();
		expect(await embedTexts(ai, [])).toEqual([]);
		expect(calls).toEqual([]);
	});
});

describe('embedText', () => {
	it('returns a single vector', async () => {
		const { ai } = stubAi();
		expect(await embedText(ai, 'hello')).toEqual([0, 0]);
	});
});
