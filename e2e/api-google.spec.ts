import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// The Gmail connection (M74): /api/google/* runs the OAuth flow and manages
// connected accounts. The E2E env has no Google secrets, so the connect and
// callback routes report Gmail unconfigured (503); the accounts and disconnect
// routes do not need Google config and are exercised fully.
test.describe('Gmail connection API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('connect reports Gmail unconfigured in this environment', async ({ request }) => {
		const res = await request.get('/api/google/connect?personId=person-matt', {
			maxRedirects: 0
		});
		expect(res.status()).toBe(503);
	});

	test('callback reports Gmail unconfigured in this environment', async ({ request }) => {
		const res = await request.get('/api/google/callback', { maxRedirects: 0 });
		expect(res.status()).toBe(503);
	});

	test('the accounts list is adult-gated and returns an array', async ({ request }) => {
		const ok = await request.get('/api/google/accounts?personId=person-matt');
		expect(ok.status()).toBe(200);
		expect(Array.isArray(await ok.json())).toBe(true);

		const denied = await request.get('/api/google/accounts?personId=person-three');
		expect(denied.status()).toBe(403);
	});

	test('disconnect validates its body and is adult-gated', async ({ request }) => {
		// Missing accountId — rejected before the adult check.
		const bad = await request.post('/api/google/disconnect', {
			data: { personId: 'person-matt' }
		});
		expect(bad.status()).toBe(400);

		// A non-adult member is refused.
		const denied = await request.post('/api/google/disconnect', {
			data: { personId: 'person-three', accountId: 'whatever' }
		});
		expect(denied.status()).toBe(403);

		// An adult disconnecting an unknown account: a clean no-op.
		const ok = await request.post('/api/google/disconnect', {
			data: { personId: 'person-matt', accountId: 'no-such-account' }
		});
		expect(ok.status()).toBe(200);
		expect((await ok.json()).disconnected).toBe(false);
	});
});
