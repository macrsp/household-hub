import { describe, it, expect } from 'vitest';
import { indexMessages, relevantMessageIds } from './semantic-index';

// A stub env with Workers AI + Vectorize that records what gets upserted.
function stubEnv() {
	const upserted: { id: string }[] = [];
	const env = {
		AI: {
			run: async (_model: string, opts: { text: string[] }) => ({
				data: opts.text.map(() => [0.1, 0.2])
			})
		},
		VECTORIZE: {
			upsert: async (vectors: { id: string }[]) => {
				upserted.push(...vectors);
				return { count: vectors.length };
			}
		}
	};
	return { env: env as unknown as App.Platform['env'], upserted };
}

describe('indexMessages', () => {
	it('embeds and upserts each message with a non-empty body', async () => {
		const { env, upserted } = stubEnv();
		const n = await indexMessages(env, [
			{ id: 'm1', body: 'hello', conversation_id: 'c1' },
			{ id: 'm2', body: 'world', conversation_id: 'c1' }
		]);
		expect(n).toBe(2);
		expect(upserted.map((v) => v.id)).toEqual(['m1', 'm2']);
	});

	it('skips messages with a blank body', async () => {
		const { env, upserted } = stubEnv();
		const n = await indexMessages(env, [
			{ id: 'm1', body: '   ', conversation_id: 'c1' },
			{ id: 'm2', body: 'real', conversation_id: 'c1' }
		]);
		expect(n).toBe(1);
		expect(upserted.map((v) => v.id)).toEqual(['m2']);
	});

	it('is a no-op returning 0 when Vectorize is absent', async () => {
		const env = { AI: {} } as unknown as App.Platform['env'];
		expect(await indexMessages(env, [{ id: 'm1', body: 'x', conversation_id: 'c1' }])).toBe(0);
	});

	it('is a no-op returning 0 for an empty batch', async () => {
		const { env } = stubEnv();
		expect(await indexMessages(env, [])).toBe(0);
	});
});

describe('relevantMessageIds', () => {
	it('returns the ids of the matched vectors, in order', async () => {
		const env = {
			AI: { run: async () => ({ data: [[0.1, 0.2]] }) },
			VECTORIZE: {
				query: async () => ({
					matches: [
						{ id: 'm9', score: 0.81 },
						{ id: 'm3', score: 0.62 }
					]
				})
			}
		} as unknown as App.Platform['env'];
		expect(await relevantMessageIds(env, 'c1', 'where is the trip')).toEqual(['m9', 'm3']);
	});

	it('returns [] when Vectorize is absent', async () => {
		const env = { AI: {} } as unknown as App.Platform['env'];
		expect(await relevantMessageIds(env, 'c1', 'q')).toEqual([]);
	});

	it('returns [] when the query throws', async () => {
		const env = {
			AI: { run: async () => ({ data: [[0.1]] }) },
			VECTORIZE: {
				query: async () => {
					throw new Error('boom');
				}
			}
		} as unknown as App.Platform['env'];
		expect(await relevantMessageIds(env, 'c1', 'q')).toEqual([]);
	});
});
