import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

interface Endpoint {
	id: string;
	type: string;
	address: string;
}
interface Person {
	id: string;
	display_name: string;
	endpoints: Endpoint[];
}

async function people(
	request: import('@playwright/test').APIRequestContext
): Promise<Person[]> {
	return (await (await request.get('/api/people')).json()) as Person[];
}

// Household member + endpoint management (M40).
test.describe('people management API', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('lists the seed members with their endpoints', async ({ request }) => {
		const list = await people(request);
		const matt = list.find((p) => p.display_name === 'Matt');
		expect(matt).toBeTruthy();
		expect(Array.isArray(matt!.endpoints)).toBe(true);
		expect(matt!.endpoints.some((e) => e.type === 'sms')).toBe(true);
	});

	test('adds a member and joins them to every conversation', async ({ request }) => {
		const res = await request.post('/api/people', { data: { displayName: 'Dana Member' } });
		expect(res.status(), await res.text()).toBe(201);
		const id = (await res.json()).id as string;

		expect((await people(request)).some((p) => p.id === id)).toBe(true);

		// The new member participates in #general — posting as them succeeds.
		const post = await request.post('/api/conversations/general/messages', {
			data: { authorPersonId: id, body: 'hello from a new member' }
		});
		expect(post.status()).toBe(201);
	});

	test('rejects a blank member name', async ({ request }) => {
		const res = await request.post('/api/people', { data: { displayName: '   ' } });
		expect(res.status()).toBe(400);
	});

	test('renames a member', async ({ request }) => {
		const id = (await people(request))[0].id;
		const res = await request.patch(`/api/people/${id}`, {
			data: { displayName: 'Renamed Member' }
		});
		expect(res.status()).toBe(200);
		expect((await people(request)).find((p) => p.id === id)!.display_name).toBe('Renamed Member');
	});

	test('404 renaming an unknown member', async ({ request }) => {
		const res = await request.patch('/api/people/person-nobody', {
			data: { displayName: 'x' }
		});
		expect(res.status()).toBe(404);
	});

	test('adds an endpoint to a member', async ({ request }) => {
		const id = (await people(request)).find((p) => p.display_name === 'Person Three')!.id;
		const res = await request.post(`/api/people/${id}/endpoints`, {
			data: { type: 'email', address: 'three@example.test' }
		});
		expect(res.status(), await res.text()).toBe(201);

		const updated = (await people(request)).find((p) => p.id === id)!;
		expect(updated.endpoints.some((e) => e.address === 'three@example.test')).toBe(true);
	});

	test('rejects an unknown endpoint type', async ({ request }) => {
		const id = (await people(request))[0].id;
		const res = await request.post(`/api/people/${id}/endpoints`, {
			data: { type: 'carrier-pigeon', address: 'x' }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a malformed email endpoint', async ({ request }) => {
		const id = (await people(request))[0].id;
		const res = await request.post(`/api/people/${id}/endpoints`, {
			data: { type: 'email', address: 'not-an-email' }
		});
		expect(res.status()).toBe(400);
	});

	test('409 on a duplicate endpoint address', async ({ request }) => {
		const id = (await people(request)).find((p) => p.display_name === 'Person Three')!.id;
		// The seed already has ep-matt-sms +15550000001.
		const res = await request.post(`/api/people/${id}/endpoints`, {
			data: { type: 'sms', address: '+15550000001' }
		});
		expect(res.status()).toBe(409);
	});
});
