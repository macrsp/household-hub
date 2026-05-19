import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// The app's own changelog (M77): POST /api/changelog posts a "what shipped"
// note into the #claude dev channel as Claude Code.
test.describe('changelog API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('a changelog entry is posted into the #claude channel', async ({ request }) => {
		const res = await request.post('/api/changelog', {
			data: { summary: 'M77 — the app posts its own changelog' }
		});
		expect(res.status(), await res.text()).toBe(201);
		expect((await res.json()).posted).toBe(true);

		const messages = await (
			await request.get('/api/conversations/claude/messages')
		).json();
		const entry = messages.find((m: { body: string }) => m.body.includes('M77'));
		expect(entry).toBeTruthy();
		expect(entry.body).toContain('📦 Shipped');
		expect(entry.author_name).toBe('Claude Code');
	});

	test('an empty summary is rejected with 400', async ({ request }) => {
		const res = await request.post('/api/changelog', { data: { summary: '  ' } });
		expect(res.status()).toBe(400);
	});

	test('an unknown conversation is rejected with 404', async ({ request }) => {
		const res = await request.post('/api/changelog?slug=no-such-thread', {
			data: { summary: 'anything' }
		});
		expect(res.status()).toBe(404);
	});
});
