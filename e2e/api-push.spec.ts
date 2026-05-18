import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

function subscription(endpoint: string) {
	return {
		endpoint,
		keys: { p256dh: 'BPtest_p256dh_key', auth: 'test_auth_key' }
	};
}

// Web Push subscription routes (M38). The E2E server has no VAPID environment,
// so push is "not configured" — /api/push/public-key 404s — but subscriptions
// can still be stored and removed.
test.describe('web push subscription API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('public-key route 404s when push is not configured', async ({ request }) => {
		const res = await request.get('/api/push/public-key');
		expect(res.status()).toBe(404);
	});

	test('stores a valid subscription', async ({ request }) => {
		const res = await request.post('/api/push/subscribe', {
			data: {
				personId: 'person-matt',
				subscription: subscription('https://push.example.test/sub-1')
			}
		});
		expect(res.status(), await res.text()).toBe(201);
	});

	test('re-subscribing the same endpoint is idempotent', async ({ request }) => {
		const sub = subscription('https://push.example.test/sub-dup');
		await request.post('/api/push/subscribe', {
			data: { personId: 'person-matt', subscription: sub }
		});
		const again = await request.post('/api/push/subscribe', {
			data: { personId: 'person-two', subscription: sub }
		});
		expect(again.status()).toBe(201);
	});

	test('rejects a subscription with no endpoint', async ({ request }) => {
		const res = await request.post('/api/push/subscribe', {
			data: { personId: 'person-matt', subscription: { keys: { p256dh: 'x', auth: 'y' } } }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a subscription from an unknown person', async ({ request }) => {
		const res = await request.post('/api/push/subscribe', {
			data: {
				personId: 'person-nobody',
				subscription: subscription('https://push.example.test/sub-2')
			}
		});
		expect(res.status()).toBe(400);
	});

	test('unsubscribe removes a subscription and is idempotent', async ({ request }) => {
		const endpoint = 'https://push.example.test/sub-3';
		await request.post('/api/push/subscribe', {
			data: { personId: 'person-matt', subscription: subscription(endpoint) }
		});

		const first = await request.post('/api/push/unsubscribe', { data: { endpoint } });
		expect(first.status()).toBe(200);

		const again = await request.post('/api/push/unsubscribe', { data: { endpoint } });
		expect(again.status()).toBe(200);
	});

	test('unsubscribe rejects a missing endpoint', async ({ request }) => {
		const res = await request.post('/api/push/unsubscribe', { data: {} });
		expect(res.status()).toBe(400);
	});
});
