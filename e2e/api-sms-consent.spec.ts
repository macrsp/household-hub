import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// The SMS opt-in consent flow (M34): the /api/sms-consent route and the
// /sms-opt-in page. The server must never record a consent without the
// explicit `agreed: true` flag and a valid name + phone.
test.describe('SMS opt-in consent', () => {
	test.beforeEach(async ({ request }) => {
		await resetDatabase(request);
	});

	test('records a valid consent submission', async ({ request }) => {
		const res = await request.post('/api/sms-consent', {
			data: { name: 'Casey Member', phone: '+1 (555) 010-2030', agreed: true }
		});
		expect(res.status(), await res.text()).toBe(201);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.consented_at).toBeTruthy();
	});

	test('rejects a submission without the agreement flag', async ({ request }) => {
		const res = await request.post('/api/sms-consent', {
			data: { name: 'Casey Member', phone: '5550102030' }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a submission where agreed is false', async ({ request }) => {
		const res = await request.post('/api/sms-consent', {
			data: { name: 'Casey Member', phone: '5550102030', agreed: false }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a blank name', async ({ request }) => {
		const res = await request.post('/api/sms-consent', {
			data: { name: '   ', phone: '5550102030', agreed: true }
		});
		expect(res.status()).toBe(400);
	});

	test('rejects a phone number with too few digits', async ({ request }) => {
		const res = await request.post('/api/sms-consent', {
			data: { name: 'Casey Member', phone: '12345', agreed: true }
		});
		expect(res.status()).toBe(400);
	});

	test('the /sms-opt-in page records consent and confirms it', async ({ page, request }) => {
		await resetDatabase(request);
		await page.goto('/sms-opt-in');

		await expect(page.getByRole('heading', { name: /SMS Opt-In/, level: 1 })).toBeVisible();
		await page.getByLabel('Your name').fill('Casey Member');
		await page.getByLabel('Mobile phone number').fill('555-010-2030');
		await page.getByRole('checkbox').check();
		await page.getByRole('button', { name: 'Give consent' }).click();

		await expect(page.getByText(/your consent has been recorded/i)).toBeVisible();
	});
});
