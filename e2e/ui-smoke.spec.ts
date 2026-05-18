import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers';

// A browser smoke test: the conversation PWA loads, a message can be sent
// through the composer, and it appears in the list. Drives the real app
// against the real API — no route mocking.
test.describe('conversation UI', () => {
	test('loads the conversation page and sends a message', async ({ page, request }) => {
		await resetDatabase(request);
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Household Hub' })).toBeVisible();
		await expect(page.getByText('No messages in #general yet. Say hello below.')).toBeVisible();

		const composer = page.getByPlaceholder(/Message #general/);
		await composer.fill('hello from playwright');
		await page.getByRole('button', { name: 'Send' }).click();

		await expect(page.getByText('hello from playwright')).toBeVisible();
	});

	test('loads the privacy policy page', async ({ page }) => {
		await page.goto('/privacy');
		await expect(
			page.getByRole('heading', { name: /Privacy Policy/, level: 1 })
		).toBeVisible();
	});
});
