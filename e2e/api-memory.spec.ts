import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// The household memory graph (M71): /api/memory stores and recalls facts about
// the household. Every route is adult-gated — person-matt is an 'adult' in the
// reset fixture, person-three is a 'member'.
test.describe('household memory API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('an adult stores a fact and reads it back', async ({ request }) => {
		const post = await request.post('/api/memory/facts', {
			data: {
				personId: 'person-matt',
				subject: 'the house',
				subjectKind: 'place',
				predicate: 'wifi_password',
				object: 'hunter2'
			}
		});
		expect(post.status(), await post.text()).toBe(201);
		const fact = await post.json();
		expect(fact.predicate).toBe('wifi_password');
		expect(fact.object_text).toBe('hunter2');
		expect(fact.status).toBe('confirmed');

		const get = await request.get(
			'/api/memory/facts?personId=person-matt&subject=the%20house'
		);
		expect(get.status()).toBe(200);
		const body = await get.json();
		expect(body.entity.name).toBe('the house');
		expect(body.facts).toHaveLength(1);
		expect(body.facts[0].object_text).toBe('hunter2');
	});

	test('an entity-to-entity fact links two nodes', async ({ request }) => {
		const post = await request.post('/api/memory/facts', {
			data: {
				personId: 'person-matt',
				subject: 'Mia',
				subjectKind: 'person',
				predicate: 'teacher',
				object: 'Ms. Lee',
				objectIsEntity: true,
				objectKind: 'person'
			}
		});
		expect(post.status(), await post.text()).toBe(201);
		const fact = await post.json();
		expect(fact.object_entity_id).toBeTruthy();
		expect(fact.object_text).toBeNull();
	});

	test('a non-adult member is refused with 403', async ({ request }) => {
		const res = await request.post('/api/memory/facts', {
			data: {
				personId: 'person-three',
				subject: 'the house',
				predicate: 'wifi_password',
				object: 'hunter2'
			}
		});
		expect(res.status()).toBe(403);
	});

	test('a missing field is rejected with 400', async ({ request }) => {
		const res = await request.post('/api/memory/facts', {
			data: { personId: 'person-matt', subject: 'the house' }
		});
		expect(res.status()).toBe(400);
	});

	test('the ask endpoint responds without crashing for an adult (M72)', async ({ request }) => {
		await request.post('/api/memory/facts', {
			data: {
				personId: 'person-matt',
				subject: 'the house',
				subjectKind: 'place',
				predicate: 'wifi_password',
				object: 'hunter2'
			}
		});
		const res = await request.post('/api/memory/ask', {
			data: { personId: 'person-matt', question: 'what is the wifi password' }
		});
		// No Workers AI in the E2E env, so the answer is reported unavailable.
		expect([200, 503]).toContain(res.status());
		const data = await res.json();
		expect(typeof data.available).toBe('boolean');
	});

	test('the ask endpoint refuses a non-adult with 403 (M72)', async ({ request }) => {
		const res = await request.post('/api/memory/ask', {
			data: { personId: 'person-three', question: 'anything' }
		});
		expect(res.status()).toBe(403);
	});

	test('the ask endpoint rejects an empty question with 400 (M72)', async ({ request }) => {
		const res = await request.post('/api/memory/ask', {
			data: { personId: 'person-matt', question: '  ' }
		});
		expect(res.status()).toBe(400);
	});

	test('the proposed-facts list is adult-gated and returns an array (M73)', async ({
		request
	}) => {
		const ok = await request.get('/api/memory/proposed?personId=person-matt');
		expect(ok.status()).toBe(200);
		expect(Array.isArray(await ok.json())).toBe(true);

		const denied = await request.get('/api/memory/proposed?personId=person-three');
		expect(denied.status()).toBe(403);
	});

	test('confirm and reject are adult-gated and no-op on an unknown fact (M73)', async ({
		request
	}) => {
		const confirm = await request.post('/api/memory/facts/no-such-fact/confirm', {
			data: { personId: 'person-matt' }
		});
		expect(confirm.status()).toBe(200);
		expect((await confirm.json()).confirmed).toBe(false);

		const reject = await request.post('/api/memory/facts/no-such-fact/reject', {
			data: { personId: 'person-matt' }
		});
		expect(reject.status()).toBe(200);
		expect((await reject.json()).rejected).toBe(false);

		const denied = await request.post('/api/memory/facts/no-such-fact/confirm', {
			data: { personId: 'person-three' }
		});
		expect(denied.status()).toBe(403);
	});

	test('the calendar endpoint is adult-gated and returns an array (M76)', async ({
		request
	}) => {
		const ok = await request.get('/api/memory/calendar?personId=person-matt');
		expect(ok.status()).toBe(200);
		expect(Array.isArray(await ok.json())).toBe(true);

		const denied = await request.get('/api/memory/calendar?personId=person-three');
		expect(denied.status()).toBe(403);
	});

	test('a shopping-list item is added and listed (M76)', async ({ request }) => {
		const add = await request.post('/api/memory/facts', {
			data: {
				personId: 'person-matt',
				subject: 'shopping list',
				predicate: 'needs',
				object: 'oat milk'
			}
		});
		expect(add.status(), await add.text()).toBe(201);

		const list = await request.get('/api/memory/list?personId=person-matt&predicate=needs');
		expect(list.status()).toBe(200);
		const items = await list.json();
		expect(items.some((f: { object_text: string }) => f.object_text === 'oat milk')).toBe(true);

		const denied = await request.get('/api/memory/list?personId=person-three');
		expect(denied.status()).toBe(403);
	});

	test('the flyer-scan endpoint validates and is adult-gated (M80)', async ({ request }) => {
		// A non-adult is refused.
		const denied = await request.post('/api/memory/flyer?personId=person-three', {
			data: Buffer.from('fake-image-bytes'),
			headers: { 'content-type': 'image/jpeg' }
		});
		expect(denied.status()).toBe(403);

		// An empty body is rejected before the AI check.
		const empty = await request.post('/api/memory/flyer?personId=person-matt', {
			data: Buffer.from(''),
			headers: { 'content-type': 'image/jpeg' }
		});
		expect(empty.status()).toBe(400);

		// A well-formed upload: the E2E env has no Workers AI, so the flyer
		// scan reports itself unavailable (503) rather than erroring.
		const ok = await request.post('/api/memory/flyer?personId=person-matt', {
			data: Buffer.from('fake-image-bytes'),
			headers: { 'content-type': 'image/jpeg' }
		});
		expect([200, 503]).toContain(ok.status());
		const data = await ok.json();
		expect(typeof data.available).toBe('boolean');
	});

	test('the entities list is adult-gated and returns an array', async ({ request }) => {
		await request.post('/api/memory/facts', {
			data: {
				personId: 'person-matt',
				subject: 'the dog',
				subjectKind: 'pet',
				predicate: 'name',
				object: 'Rex'
			}
		});
		const ok = await request.get('/api/memory/entities?personId=person-matt');
		expect(ok.status()).toBe(200);
		expect(Array.isArray(await ok.json())).toBe(true);

		const denied = await request.get('/api/memory/entities?personId=person-three');
		expect(denied.status()).toBe(403);
	});
});
