import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

interface ListedConversation {
	slug: string;
	name: string;
	archived_at: string | null;
}

// Conversation creation (M18), rename + archive (M27), and export (M30).
test.describe('conversations API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('lists the seed conversations', async ({ request }) => {
		const res = await request.get('/api/conversations');
		expect(res.ok()).toBeTruthy();
		const slugs = ((await res.json()) as ListedConversation[]).map((c) => c.slug);
		expect(slugs).toContain('general');
		expect(slugs).toContain('groceries');
	});

	test('creates a conversation', async ({ request }) => {
		const res = await request.post('/api/conversations', {
			data: { name: 'Weekend Trip', slug: 'weekend-trip' }
		});
		expect(res.status(), await res.text()).toBe(201);

		const list = (await (await request.get('/api/conversations')).json()) as ListedConversation[];
		expect(list.some((c) => c.slug === 'weekend-trip')).toBe(true);
	});

	test('creates a conversation with only the chosen members (M47)', async ({ request }) => {
		const res = await request.post('/api/conversations', {
			data: { name: 'Parents', slug: 'parents', personIds: ['person-matt', 'person-two'] }
		});
		expect(res.status(), await res.text()).toBe(201);

		const members = await (
			await request.get('/api/conversations/parents/participants')
		).json();
		expect(members.map((m: { person_id: string }) => m.person_id).sort()).toEqual([
			'person-matt',
			'person-two'
		]);
	});

	test('rejects creation with an unknown personId (M47)', async ({ request }) => {
		const res = await request.post('/api/conversations', {
			data: { name: 'Bad', slug: 'bad-thread', personIds: ['person-nobody'] }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a duplicate slug with 409', async ({ request }) => {
		const res = await request.post('/api/conversations', {
			data: { name: 'General Again', slug: 'general' }
		});
		expect(res.status()).toBe(409);
	});

	test('renames a conversation', async ({ request }) => {
		const res = await request.patch('/api/conversations/groceries', {
			data: { name: 'Grocery List' }
		});
		expect(res.status()).toBe(200);

		const list = (await (await request.get('/api/conversations')).json()) as ListedConversation[];
		expect(list.find((c) => c.slug === 'groceries')!.name).toBe('Grocery List');
	});

	test('archives and un-archives a conversation', async ({ request }) => {
		await request.patch('/api/conversations/groceries', { data: { archived: true } });
		let list = (await (await request.get('/api/conversations')).json()) as ListedConversation[];
		expect(list.find((c) => c.slug === 'groceries')!.archived_at).toBeTruthy();

		await request.patch('/api/conversations/groceries', { data: { archived: false } });
		list = (await (await request.get('/api/conversations')).json()) as ListedConversation[];
		expect(list.find((c) => c.slug === 'groceries')!.archived_at).toBeNull();
	});

	test('404 when patching an unknown conversation', async ({ request }) => {
		const res = await request.patch('/api/conversations/no-such-thread', {
			data: { name: 'x' }
		});
		expect(res.status()).toBe(404);
	});

	test('400 when patching with an empty body', async ({ request }) => {
		const res = await request.patch('/api/conversations/general', { data: {} });
		expect(res.status()).toBe(400);
	});

	test('exports a conversation transcript as a text download', async ({ request }) => {
		await postMessage(request, { body: 'exported line one' });

		const res = await request.get('/api/conversations/general/export');
		expect(res.ok()).toBeTruthy();
		expect(res.headers()['content-type']).toContain('text/plain');
		expect(res.headers()['content-disposition']).toContain('attachment');
		const text = await res.text();
		expect(text).toContain('#general');
		expect(text).toContain('exported line one');
	});

	test('the AI summary endpoint responds without crashing (M54)', async ({ request }) => {
		await postMessage(request, { body: 'something to summarise' });
		const res = await request.get('/api/conversations/general/summary');
		// The E2E server has no Workers AI auth, so the endpoint reports the
		// summary unavailable (503) rather than erroring.
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
	});

	test('the AI summary endpoint 404s for an unknown conversation (M54)', async ({ request }) => {
		const res = await request.get('/api/conversations/no-such-thread/summary');
		expect(res.status()).toBe(404);
	});

	test('the AI to-dos endpoint responds without crashing (M56)', async ({ request }) => {
		await postMessage(request, { body: 'someone should book the dentist' });
		const res = await request.get('/api/conversations/general/actions');
		// The E2E server has no Workers AI auth, so the endpoint reports to-dos
		// unavailable (503) rather than erroring.
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(Array.isArray(data.actions)).toBe(true);
	});

	test('the AI to-dos endpoint 404s for an unknown conversation (M56)', async ({ request }) => {
		const res = await request.get('/api/conversations/no-such-thread/actions');
		expect(res.status()).toBe(404);
	});

	test('the AI reply-suggestions endpoint responds without crashing (M57)', async ({
		request
	}) => {
		await postMessage(request, { body: 'are we still on for dinner tonight?' });
		const res = await request.get('/api/conversations/general/suggestions');
		// The E2E server has no Workers AI auth, so the endpoint reports
		// suggestions unavailable (503) rather than erroring.
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(Array.isArray(data.suggestions)).toBe(true);
	});

	test('the AI reply-suggestions endpoint 404s for an unknown conversation (M57)', async ({
		request
	}) => {
		const res = await request.get('/api/conversations/no-such-thread/suggestions');
		expect(res.status()).toBe(404);
	});

	test('the AI title-suggestion endpoint responds without crashing (M59)', async ({
		request
	}) => {
		await postMessage(request, { body: 'who is bringing snacks to the game?' });
		const res = await request.get('/api/conversations/general/title-suggestion');
		// The E2E server has no Workers AI auth, so the endpoint reports the
		// suggestion unavailable (503) rather than erroring.
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(typeof data.title).toBe('string');
	});

	test('the AI title-suggestion endpoint 404s for an unknown conversation (M59)', async ({
		request
	}) => {
		const res = await request.get('/api/conversations/no-such-thread/title-suggestion');
		expect(res.status()).toBe(404);
	});

	test('exports a conversation as a JSON download (M49)', async ({ request }) => {
		await postMessage(request, { body: 'json export line' });

		const res = await request.get('/api/conversations/general/export?format=json');
		expect(res.ok()).toBeTruthy();
		expect(res.headers()['content-type']).toContain('application/json');
		expect(res.headers()['content-disposition']).toContain('.json');

		const payload = await res.json();
		expect(payload.conversation.slug).toBe('general');
		expect(payload.message_count).toBe(payload.messages.length);
		const msg = payload.messages.find((m: { body: string }) => m.body === 'json export line');
		expect(msg).toBeTruthy();
		expect(msg.deleted).toBe(false);
		expect(msg.author).toBeTruthy();
	});
});
