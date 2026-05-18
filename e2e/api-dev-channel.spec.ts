import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// The #claude dev channel (M52): a built-in conversation where members post
// requests and Claude Code (person-claude) posts back.
test.describe('dev channel', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('the #claude conversation exists', async ({ request }) => {
		const conversations = await (await request.get('/api/conversations')).json();
		expect(conversations.some((c: { slug: string }) => c.slug === 'claude')).toBe(true);
	});

	test('a request and a Claude Code reply both live in the channel', async ({ request }) => {
		const reqPost = await request.post('/api/conversations/claude/messages', {
			data: { authorPersonId: 'person-matt', body: 'add a dark-mode toggle' }
		});
		expect(reqPost.status()).toBe(201);

		// The runner posts the response as the person-claude member.
		const replyPost = await request.post('/api/conversations/claude/messages', {
			data: { authorPersonId: 'person-claude', body: 'Shipped: dark-mode toggle.' }
		});
		expect(replyPost.status(), await replyPost.text()).toBe(201);

		const messages = await (
			await request.get('/api/conversations/claude/messages')
		).json();
		const claudeReply = messages.find((m: { author_name: string }) => m.author_name === 'Claude Code');
		expect(claudeReply.body).toBe('Shipped: dark-mode toggle.');
	});

	test('an @claude mention in a normal conversation posts cleanly (M55)', async ({ request }) => {
		// The in-app assistant runs after the response via waitUntil and is a
		// no-op without Workers AI (the E2E env has none) — the send itself
		// must still succeed normally.
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: '@claude what should we have for dinner?' }
		});
		expect(res.status(), await res.text()).toBe(201);
		expect((await res.json()).body).toContain('@claude');
	});

	test('?since= returns only messages newer than the cursor', async ({ request }) => {
		const first = await request.post('/api/conversations/claude/messages', {
			data: { authorPersonId: 'person-matt', body: 'first request' }
		});
		const cursor = (await first.json()).created_at as string;

		await request.post('/api/conversations/claude/messages', {
			data: { authorPersonId: 'person-two', body: 'second request' }
		});

		const res = await request.get(
			`/api/conversations/claude/messages?since=${encodeURIComponent(cursor)}`
		);
		const newer = await res.json();
		expect(newer).toHaveLength(1);
		expect(newer[0].body).toBe('second request');
	});
});
