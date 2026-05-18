import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

interface ListedMessage {
	id: string;
	pinned_at: string | null;
}

async function pinnedAt(
	request: import('@playwright/test').APIRequestContext,
	messageId: string
): Promise<string | null> {
	const res = await request.get('/api/conversations/general/messages');
	const messages = (await res.json()) as ListedMessage[];
	return messages.find((m) => m.id === messageId)?.pinned_at ?? null;
}

// Pinning messages (M37).
test.describe('message pinning', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('pins and unpins a message', async ({ request }) => {
		const id = await postMessage(request, { body: 'gate code is 4417' });
		const url = `/api/conversations/general/messages/${id}/pin`;

		const pin = await request.post(url, { data: { pinned: true } });
		expect(pin.status(), await pin.text()).toBe(200);
		expect(await pinnedAt(request, id)).toBeTruthy();

		const unpin = await request.post(url, { data: { pinned: false } });
		expect(unpin.status()).toBe(200);
		expect(await pinnedAt(request, id)).toBeNull();
	});

	test('rejects a non-boolean pinned value with 400', async ({ request }) => {
		const id = await postMessage(request);
		const res = await request.post(`/api/conversations/general/messages/${id}/pin`, {
			data: { pinned: 'yes' }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects an empty body with 400', async ({ request }) => {
		const id = await postMessage(request);
		const res = await request.post(`/api/conversations/general/messages/${id}/pin`, {
			data: {}
		});
		expect(res.status()).toBe(400);
	});

	test('404 pinning an unknown message', async ({ request }) => {
		const res = await request.post('/api/conversations/general/messages/no-such-id/pin', {
			data: { pinned: true }
		});
		expect(res.status()).toBe(404);
	});
});
