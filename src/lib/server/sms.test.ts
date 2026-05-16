import { describe, it, expect } from 'vitest';
import { verifyTwilioSignature } from './sms';

// `validSignature` is HMAC-SHA1(payload, authToken) base64 for this exact URL
// and POST-parameter set, where `payload` is built by Twilio's documented
// algorithm (URL, then each parameter name+value concatenated in sorted
// order). It was cross-checked against an independent Node `crypto` HMAC
// implementation, so it pins verifyTwilioSignature: any drift in the
// algorithm fails the first assertion.
describe('verifyTwilioSignature', () => {
	const authToken = '12345';
	const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
	const params = {
		CallSid: 'CA1234567890ABCDE',
		Caller: '+14158675309',
		Digits: '1234',
		From: '+14158675309',
		To: '+18005551212'
	};
	const validSignature = 'RSOYDt4T1cUTdK1PDd93/VVr8B8=';

	it('accepts a correctly signed request', async () => {
		expect(await verifyTwilioSignature(authToken, url, params, validSignature)).toBe(true);
	});

	it('rejects a wrong signature', async () => {
		expect(
			await verifyTwilioSignature(authToken, url, params, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=')
		).toBe(false);
	});

	it('rejects when a signed parameter is altered', async () => {
		const tampered = { ...params, Digits: '9999' };
		expect(await verifyTwilioSignature(authToken, url, tampered, validSignature)).toBe(false);
	});

	it('rejects an empty signature', async () => {
		expect(await verifyTwilioSignature(authToken, url, params, '')).toBe(false);
	});
});
