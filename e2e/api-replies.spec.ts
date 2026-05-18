import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

interface ListedMessage {
	id: string;
	body: string;
	reply_to_message_id: string | null;
}

// Message replies (M42).
test.describe('message replies', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('a message can reply to an earlier message', async ({ request }) => {
		const targetId = await postMessage(request, { body: 'what time is dinner?' });

		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-two', body: 'six o’clock', replyToMessageId: targetId }
		});
		expect(res.status(), await res.text()).toBe(201);
		expect((await res.json()).reply_to_message_id).toBe(targetId);

		const list = (await (
			await request.get('/api/conversations/general/messages')
		).json()) as ListedMessage[];
		const reply = list.find((m) => m.body === 'six o’clock');
		expect(reply!.reply_to_message_id).toBe(targetId);
	});

	test('a non-reply message has a null reply_to_message_id', async ({ request }) => {
		const id = await postMessage(request, { body: 'plain message' });
		const list = (await (
			await request.get('/api/conversations/general/messages')
		).json()) as ListedMessage[];
		expect(list.find((m) => m.id === id)!.reply_to_message_id).toBeNull();
	});

	test('rejects a reply target that is not a message in the conversation', async ({
		request
	}) => {
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'reply', replyToMessageId: 'no-such-id' }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a reply target from a different conversation', async ({ request }) => {
		const otherId = await postMessage(request, { slug: 'groceries', body: 'in groceries' });
		const res = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'cross-thread reply', replyToMessageId: otherId }
		});
		expect(res.status()).toBe(400);
	});
});
