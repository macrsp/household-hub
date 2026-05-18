import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// Household digest (M61): GET /api/digest summarises recent activity across
// every active conversation with Workers AI. The E2E env has no Workers AI
// auth, so the endpoint reports the digest unavailable (503) rather than
// erroring.
test.describe('household digest API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('the digest endpoint responds without crashing', async ({ request }) => {
		await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'anything new today?' }
		});
		const res = await request.get('/api/digest');
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(typeof data.digest).toBe('string');
	});

	// The posted digest (M63) — a cron-callable endpoint that posts the digest
	// into a conversation as Claude Code.
	test('the digest-post endpoint responds without crashing (M63)', async ({ request }) => {
		const res = await request.post('/api/digest/post');
		// With no Workers AI in the E2E env it cannot build a digest, so it
		// reports nothing posted (503) rather than erroring.
		expect([200, 201, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.posted).toBe('boolean');
	});

	test('the digest-post endpoint 404s for an unknown conversation (M63)', async ({
		request
	}) => {
		const res = await request.post('/api/digest/post?slug=no-such-thread');
		expect(res.status()).toBe(404);
	});
});
