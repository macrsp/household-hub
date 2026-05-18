import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

interface Participant {
	person_id: string;
	display_name: string;
}

async function participants(
	request: import('@playwright/test').APIRequestContext,
	slug = 'general'
): Promise<Participant[]> {
	return (await (
		await request.get(`/api/conversations/${slug}/participants`)
	).json()) as Participant[];
}

// Conversation participant management (M43).
test.describe('conversation participants API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('lists the seed participants of a conversation', async ({ request }) => {
		const list = await participants(request);
		expect(list.length).toBe(3);
		expect(list.some((p) => p.person_id === 'person-matt')).toBe(true);
	});

	test('removing then re-adding a participant', async ({ request }) => {
		const remove = await request.delete(
			'/api/conversations/general/participants/person-three'
		);
		expect(remove.status()).toBe(200);
		expect((await participants(request)).some((p) => p.person_id === 'person-three')).toBe(false);

		const add = await request.post('/api/conversations/general/participants', {
			data: { personId: 'person-three' }
		});
		expect(add.status(), await add.text()).toBe(201);
		expect((await participants(request)).some((p) => p.person_id === 'person-three')).toBe(true);
	});

	test('adding a participant is idempotent', async ({ request }) => {
		const again = await request.post('/api/conversations/general/participants', {
			data: { personId: 'person-matt' }
		});
		expect(again.status()).toBe(201);
		expect((await participants(request)).filter((p) => p.person_id === 'person-matt')).toHaveLength(
			1
		);
	});

	test('rejects adding an unknown person', async ({ request }) => {
		const res = await request.post('/api/conversations/general/participants', {
			data: { personId: 'person-nobody' }
		});
		expect(res.status()).toBe(400);
	});

	test('404 listing an unknown conversation', async ({ request }) => {
		const res = await request.get('/api/conversations/no-such-thread/participants');
		expect(res.status()).toBe(404);
	});

	test('404 removing someone who is not a participant', async ({ request }) => {
		await request.delete('/api/conversations/general/participants/person-three');
		const res = await request.delete('/api/conversations/general/participants/person-three');
		expect(res.status()).toBe(404);
	});

	test('the conversation still accepts messages after a member is removed', async ({
		request
	}) => {
		await request.delete('/api/conversations/general/participants/person-three');
		const post = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: 'person-matt', body: 'still works with fewer members' }
		});
		expect(post.status()).toBe(201);
	});
});
