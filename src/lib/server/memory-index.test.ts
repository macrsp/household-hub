import { describe, it, expect } from 'vitest';
import { factSentence, relevantFactIds } from './memory-index';

describe('factSentence', () => {
	it('renders a fact with the predicate spaced for the embedding model', () => {
		expect(factSentence('the house', 'wifi_password', 'hunter2')).toBe(
			'the house: wifi password is hunter2'
		);
	});
});

describe('relevantFactIds', () => {
	it('returns the ids of the matched fact vectors', async () => {
		const env = {
			AI: { run: async () => ({ data: [[0.1, 0.2]] }) },
			VECTORIZE_FACTS: {
				query: async () => ({ matches: [{ id: 'f1', score: 0.8 }, { id: 'f2', score: 0.6 }] })
			}
		} as unknown as App.Platform['env'];
		expect(await relevantFactIds(env, 'wifi password')).toEqual(['f1', 'f2']);
	});

	it('returns [] when the facts index is absent', async () => {
		const env = { AI: {} } as unknown as App.Platform['env'];
		expect(await relevantFactIds(env, 'anything')).toEqual([]);
	});

	it('returns [] when the query throws', async () => {
		const env = {
			AI: { run: async () => ({ data: [[0.1]] }) },
			VECTORIZE_FACTS: {
				query: async () => {
					throw new Error('boom');
				}
			}
		} as unknown as App.Platform['env'];
		expect(await relevantFactIds(env, 'q')).toEqual([]);
	});
});
