import { describe, it, expect } from 'vitest';
import {
	encryptToken,
	decryptToken,
	signState,
	verifyState,
	googleConfigured
} from './google';

// A sample base64-encoded 256-bit key — the shape of TOKEN_ENCRYPTION_KEY.
const KEY = 'LlduK3p7W3l+aFJ9+vZbUr4q1hiMByHAtsHCDLz3jsM=';

describe('encryptToken / decryptToken', () => {
	it('round-trips a token through encryption', async () => {
		const enc = await encryptToken(KEY, 'ya29.a-secret-access-token');
		expect(enc).not.toContain('ya29');
		expect(await decryptToken(KEY, enc)).toBe('ya29.a-secret-access-token');
	});

	it('uses a fresh IV, so the same token encrypts differently each time', async () => {
		const a = await encryptToken(KEY, 'same-token');
		const b = await encryptToken(KEY, 'same-token');
		expect(a).not.toBe(b);
		expect(await decryptToken(KEY, a)).toBe('same-token');
		expect(await decryptToken(KEY, b)).toBe('same-token');
	});
});

describe('signState / verifyState', () => {
	it('round-trips the personId', async () => {
		const state = await signState('client-secret', 'person-matt');
		expect(await verifyState('client-secret', state)).toBe('person-matt');
	});

	it('rejects a tampered state', async () => {
		const state = await signState('client-secret', 'person-matt');
		expect(await verifyState('client-secret', `${state}x`)).toBeNull();
	});

	it('rejects a state signed with a different secret', async () => {
		const state = await signState('client-secret', 'person-matt');
		expect(await verifyState('other-secret', state)).toBeNull();
	});

	it('rejects a stale state', async () => {
		const state = await signState('client-secret', 'person-matt');
		// A negative max-age makes any state immediately stale.
		expect(await verifyState('client-secret', state, -1)).toBeNull();
	});

	it('rejects a malformed state', async () => {
		expect(await verifyState('client-secret', 'not-a-real-state')).toBeNull();
	});
});

describe('googleConfigured', () => {
	const env = (o: Record<string, string>) => o as unknown as App.Platform['env'];

	it('is true only when all three Google secrets are present', () => {
		expect(
			googleConfigured(
				env({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', TOKEN_ENCRYPTION_KEY: 'c' })
			)
		).toBe(true);
	});

	it('is false when any secret is missing', () => {
		expect(googleConfigured(env({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }))).toBe(
			false
		);
		expect(googleConfigured(env({}))).toBe(false);
	});
});
