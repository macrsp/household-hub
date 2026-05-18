import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

interface ListedMessage {
	id: string;
	body: string;
	deleted_at: string | null;
	edited_at: string | null;
}

async function listMessages(
	request: import('@playwright/test').APIRequestContext
): Promise<ListedMessage[]> {
	const res = await request.get('/api/conversations/general/messages');
	return (await res.json()) as ListedMessage[];
}

// The author-ownership gates on soft-deletion (M22) and editing (M24).
test.describe('message deletion + editing gates', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('only the author can delete a message', async ({ request }) => {
		const id = await postMessage(request);

		const wrong = await request.delete(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-two' }
		});
		expect(wrong.status()).toBe(403);

		const ok = await request.delete(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt' }
		});
		expect(ok.status()).toBe(200);
	});

	test('deleting the same message twice is idempotent', async ({ request }) => {
		const id = await postMessage(request);
		const url = `/api/conversations/general/messages/${id}`;

		const first = await request.delete(url, { data: { personId: 'person-matt' } });
		expect((await first.json()).alreadyDeleted).toBe(false);

		const second = await request.delete(url, { data: { personId: 'person-matt' } });
		expect(second.status()).toBe(200);
		expect((await second.json()).alreadyDeleted).toBe(true);
	});

	test('a deleted message reads back with a blank body and a deleted_at', async ({ request }) => {
		const id = await postMessage(request, { body: 'secret text' });
		await request.delete(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt' }
		});

		const msg = (await listMessages(request)).find((m) => m.id === id);
		expect(msg).toBeTruthy();
		expect(msg!.body).toBe('');
		expect(msg!.deleted_at).toBeTruthy();
	});

	test('404 when deleting an unknown message', async ({ request }) => {
		const res = await request.delete('/api/conversations/general/messages/no-such-id', {
			data: { personId: 'person-matt' }
		});
		expect(res.status()).toBe(404);
	});

	test('only the author can edit a message', async ({ request }) => {
		const id = await postMessage(request, { body: 'original' });

		const wrong = await request.patch(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-two', body: 'hijacked' }
		});
		expect(wrong.status()).toBe(403);

		const ok = await request.patch(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt', body: 'corrected' }
		});
		expect(ok.status()).toBe(200);
		expect((await ok.json()).body).toBe('corrected');

		const msg = (await listMessages(request)).find((m) => m.id === id);
		expect(msg!.body).toBe('corrected');
		expect(msg!.edited_at).toBeTruthy();
	});

	test('a deleted message cannot be edited (409)', async ({ request }) => {
		const id = await postMessage(request);
		await request.delete(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt' }
		});
		const res = await request.patch(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt', body: 'too late' }
		});
		expect(res.status()).toBe(409);
	});

	test('editing rejects an empty body (400)', async ({ request }) => {
		const id = await postMessage(request);
		const res = await request.patch(`/api/conversations/general/messages/${id}`, {
			data: { personId: 'person-matt', body: '   ' }
		});
		expect(res.status()).toBe(400);
	});
});
