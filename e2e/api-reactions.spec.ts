import { test, expect } from '@playwright/test';
import { resetDatabase, postMessage } from './helpers';

interface ReactionSummary {
	emoji: string;
	count: number;
	people: string[];
}
interface ListedMessage {
	id: string;
	reactions?: ReactionSummary[];
}

async function reactionsFor(
	request: import('@playwright/test').APIRequestContext,
	messageId: string
): Promise<ReactionSummary[]> {
	const res = await request.get('/api/conversations/general/messages');
	const messages = (await res.json()) as ListedMessage[];
	return messages.find((m) => m.id === messageId)?.reactions ?? [];
}

// Emoji reactions on messages (M36).
test.describe('message reactions', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('toggling a reaction on then off', async ({ request }) => {
		const id = await postMessage(request);
		const url = `/api/conversations/general/messages/${id}/reactions`;

		const add = await request.post(url, { data: { personId: 'person-matt', emoji: '👍' } });
		expect(add.status(), await add.text()).toBe(200);
		expect((await add.json()).state).toBe('added');

		let reactions = await reactionsFor(request, id);
		expect(reactions).toEqual([{ emoji: '👍', count: 1, people: ['person-matt'] }]);

		const remove = await request.post(url, { data: { personId: 'person-matt', emoji: '👍' } });
		expect((await remove.json()).state).toBe('removed');

		reactions = await reactionsFor(request, id);
		expect(reactions).toEqual([]);
	});

	test('two people reacting with the same emoji tally to a count of 2', async ({ request }) => {
		const id = await postMessage(request);
		const url = `/api/conversations/general/messages/${id}/reactions`;

		await request.post(url, { data: { personId: 'person-matt', emoji: '❤️' } });
		await request.post(url, { data: { personId: 'person-two', emoji: '❤️' } });

		const reactions = await reactionsFor(request, id);
		expect(reactions).toHaveLength(1);
		expect(reactions[0].emoji).toBe('❤️');
		expect(reactions[0].count).toBe(2);
		expect(reactions[0].people.sort()).toEqual(['person-matt', 'person-two']);
	});

	test('rejects an emoji outside the accepted set with 400', async ({ request }) => {
		const id = await postMessage(request);
		const res = await request.post(`/api/conversations/general/messages/${id}/reactions`, {
			data: { personId: 'person-matt', emoji: '🚀' }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects an unknown person with 400', async ({ request }) => {
		const id = await postMessage(request);
		const res = await request.post(`/api/conversations/general/messages/${id}/reactions`, {
			data: { personId: 'person-nobody', emoji: '👍' }
		});
		expect(res.status()).toBe(400);
	});

	test('404 reacting to an unknown message', async ({ request }) => {
		const res = await request.post('/api/conversations/general/messages/no-such-id/reactions', {
			data: { personId: 'person-matt', emoji: '👍' }
		});
		expect(res.status()).toBe(404);
	});
});
