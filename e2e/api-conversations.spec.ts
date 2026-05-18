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
});
