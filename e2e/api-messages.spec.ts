import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

// The canonical message API: post, read back, validate, paginate, search.
test.describe('messages API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('posts a message and reads it back with the author name', async ({ request }) => {
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'hello household' }
		});
		expect(res.status(), await res.text()).toBe(201);
		const created = await res.json();
		expect(created.body).toBe('hello household');
		expect(created.source_transport).toBe('app');

		const list = await request.get('/api/conversations/general/messages');
		expect(list.ok()).toBeTruthy();
		const messages = await list.json();
		expect(messages).toHaveLength(1);
		expect(messages[0].body).toBe('hello household');
		expect(messages[0].author_name).toBe('Matt');
	});

	test('rejects an unknown author with 400', async ({ request }) => {
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-nobody', body: 'x' }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects an empty body with 400', async ({ request }) => {
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: '   ' }
		});
		expect(res.status()).toBe(400);
	});

	test('404 for an unknown conversation', async ({ request }) => {
		const res = await request.get('/api/conversations/no-such-thread/messages');
		expect(res.status()).toBe(404);
	});

	test('?q= search matches message bodies', async ({ request }) => {
		await postMessage(request, { body: 'buy milk and eggs' });
		await postMessage(request, { authorPersonId: 'person-two', body: 'walk the dog' });

		const res = await request.get('/api/conversations/general/messages?q=milk');
		expect(res.ok()).toBeTruthy();
		const hits = await res.json();
		expect(hits).toHaveLength(1);
		expect(hits[0].body).toBe('buy milk and eggs');
	});
});
