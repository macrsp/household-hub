import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

interface SearchHit {
	id: string;
	body: string;
	conversation_slug: string;
	conversation_name: string;
	author_name: string;
}

// Cross-conversation search (M45).
test.describe('global search API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('finds a matching message in any conversation', async ({ request }) => {
		await postMessage(request, { slug: 'general', body: 'the plumber comes Tuesday' });
		await postMessage(request, { slug: 'groceries', body: 'buy plumber tape' });

		const res = await request.get('/api/search?q=plumber');
		expect(res.ok()).toBeTruthy();
		const hits = (await res.json()) as SearchHit[];
		expect(hits).toHaveLength(2);
		expect(new Set(hits.map((h) => h.conversation_slug))).toEqual(
			new Set(['general', 'groceries'])
		);
		for (const h of hits) {
			expect(h.conversation_name).toBeTruthy();
			expect(h.author_name).toBeTruthy();
		}
	});

	test('excludes soft-deleted messages from results', async ({ request }) => {
		const id = await postMessage(request, { slug: 'general', body: 'secret plumber note' });
		await request.delete(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt' }
		});
		const hits = (await (await request.get('/api/search?q=plumber')).json()) as SearchHit[];
		expect(hits.some((h) => h.id === id)).toBe(false);
	});

	test('400 when no search term is given', async ({ request }) => {
		const res = await request.get('/api/search');
		expect(res.status()).toBe(400);
	});

	test('returns an empty list when nothing matches', async ({ request }) => {
		const hits = (await (
			await request.get('/api/search?q=zzznomatchzzz')
		).json()) as SearchHit[];
		expect(hits).toEqual([]);
	});
});
