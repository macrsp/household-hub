import { describe, it, expect } from 'vitest';
import { sendEmail, emailConfigured } from './email';

describe('sendEmail stubs when email is not configured', () => {
	const emptyEnv = {} as App.Platform['env'];

	it('reports email as not configured with no secrets', () => {
		expect(emailConfigured(emptyEnv)).toBe(false);
	});

	it('reports email as not configured with only the API key', () => {
		expect(emailConfigured({ RESEND_API_KEY: 'rk' } as App.Platform['env'])).toBe(false);
	});

	it('returns a stubbed result instead of calling the network', async () => {
		const result = await sendEmail(emptyEnv, 'a@example.invalid', 'New message', '[Matt]: hi');
		expect(result).toEqual({ kind: 'stubbed' });
	});
});
