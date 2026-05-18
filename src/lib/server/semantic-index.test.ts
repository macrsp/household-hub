import { describe, it, expect } from 'vitest';
import { indexMessages } from './semantic-index';

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
