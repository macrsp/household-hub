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
});
