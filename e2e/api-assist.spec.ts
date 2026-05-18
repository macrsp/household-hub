import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// Compose-assist (M58): POST /api/assist/rewrite polishes a draft message
// with Workers AI. The E2E env has no Workers AI auth, so a well-formed
// request reports the rewrite unavailable (503) rather than erroring.
test.describe('compose-assist API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('a well-formed rewrite request responds without crashing', async ({ request }) => {
		const res = await request.post('/api/assist/rewrite', {
			data: { text: 'hey can u grab milk' }
		});
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
		expect(typeof data.text).toBe('string');
	});

	test('an empty draft is rejected with 400', async ({ request }) => {
		const res = await request.post('/api/assist/rewrite', { data: { text: '   ' } });
		expect(res.status()).toBe(400);
	});

	test('a missing text field is rejected with 400', async ({ request }) => {
		const res = await request.post('/api/assist/rewrite', { data: {} });
		expect(res.status()).toBe(400);
	});
});
