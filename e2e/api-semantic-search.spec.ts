import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// Semantic search (M66): GET /api/search/semantic matches messages by meaning
// via Cloudflare Vectorize, and POST /api/search/reindex backfills the index.
// The E2E env has no Vectorize binding, so both report themselves unavailable
// (503) rather than erroring.
test.describe('semantic search API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('semantic search requires a query term', async ({ request }) => {
		const res = await request.get('/api/search/semantic');
		expect(res.status()).toBe(400);
	});

	test('semantic search responds without crashing', async ({ request }) => {
		await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'what time is dinner' }
		});
		const res = await request.get('/api/search/semantic?q=evening%20meal');
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(Array.isArray(data.results)).toBe(true);
	});

	test('semantic search 404s for an unknown conversation scope', async ({ request }) => {
		const res = await request.get('/api/search/semantic?q=anything&slug=no-such-thread');
		expect(res.status()).toBe(404);
	});

	test('the reindex endpoint responds without crashing', async ({ request }) => {
		const res = await request.post('/api/search/reindex');
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(typeof data.indexed).toBe('number');
	});

	// Indexing on send is best-effort via waitUntil — with no Vectorize binding
	// it is a no-op, and the send itself must still succeed normally.
	test('posting a message still succeeds with no semantic index', async ({ request }) => {
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'a perfectly ordinary message' }
		});
		expect(res.status(), await res.text()).toBe(201);
	});
});
