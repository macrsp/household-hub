import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';
import { EMAIL_WEBHOOK_SECRET } from './test-config.mjs';

// The authentication gates: the inbound-email shared secret (M9/M11), the
// inbound-SMS path, and the test-reset route's own secret (M31). The Twilio
// request-signature algorithm itself is covered by src/lib/server/sms.test.ts;
// here the E2E server runs without TWILIO_AUTH_TOKEN, so the SMS webhook
// accepts unsigned requests (the documented local/dev behaviour).
test.describe('webhook + test-route authentication', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('email webhook rejects a missing secret with 403', async ({ request }) => {
		const res = await request.post('/api/webhooks/email', {
			data: { from: 'matt@example.test', to: 'general@example.test', body: 'hi' }
		});
		expect(res.status()).toBe(403);
	});

	test('email webhook rejects a wrong secret with 403', async ({ request }) => {
		const res = await request.post('/api/webhooks/email', {
			headers: { 'x-webhook-secret': 'definitely-wrong' },
			data: { from: 'matt@example.test', to: 'general@example.test', body: 'hi' }
		});
		expect(res.status()).toBe(403);
	});

	test('email webhook accepts the correct secret and stores the message', async ({ request }) => {
		const res = await request.post('/api/webhooks/email', {
			headers: { 'x-webhook-secret': EMAIL_WEBHOOK_SECRET },
			data: { from: 'matt@example.test', to: 'general@example.test', body: 'inbound by email' }
		});
		expect(res.status(), await res.text()).toBe(200);

		const messages = await (await request.get('/api/conversations/general/messages')).json();
		expect(messages.some((m: { body: string }) => m.body === 'inbound by email')).toBe(true);
	});

	test('email webhook rejects an unknown sender even with the correct secret', async ({
		request
	}) => {
		const res = await request.post('/api/webhooks/email', {
			headers: { 'x-webhook-secret': EMAIL_WEBHOOK_SECRET },
			data: { from: 'stranger@nowhere.test', to: 'general@example.test', body: 'hi' }
		});
		expect(res.status()).toBe(403);
	});

	test('inbound SMS from a known number creates a canonical message', async ({ request }) => {
		const res = await request.post('/api/webhooks/sms', {
			form: { From: '+15550000001', Body: 'inbound by text' }
		});
		expect(res.status(), await res.text()).toBe(200);

		const messages = await (await request.get('/api/conversations/general/messages')).json();
		const sms = messages.find((m: { body: string }) => m.body === 'inbound by text');
		expect(sms).toBeTruthy();
		expect(sms.source_transport).toBe('sms');
	});

	test('test-reset route rejects a wrong secret with 403', async ({ request }) => {
		const res = await request.post('/api/test/reset', {
			headers: { 'x-test-secret': 'not-the-secret' }
		});
		expect(res.status()).toBe(403);
	});
});
