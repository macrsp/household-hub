import { describe, it, expect } from 'vitest';
import {
	encryptToken,
	decryptToken,
	signState,
	verifyState,
	googleConfigured,
	messageText
} from './google';

function b64url(s: string): string {
	return Buffer.from(s, 'utf8').toString('base64url');
}

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

describe('messageText', () => {
	it('combines the Subject header and the decoded plain-text body', () => {
		const msg = {
			id: 'm1',
			payload: {
				headers: [{ name: 'Subject', value: 'Dentist appointment' }],
				mimeType: 'text/plain',
				body: { data: b64url('Your appointment is on June 2 at 3pm.') }
			}
		};
		expect(messageText(msg)).toBe(
			'Subject: Dentist appointment\n\nYour appointment is on June 2 at 3pm.'
		);
	});

	it('finds the plain-text part inside a multipart message', () => {
		const msg = {
			id: 'm2',
			payload: {
				headers: [{ name: 'subject', value: 'Trip' }],
				mimeType: 'multipart/alternative',
				parts: [
					{ mimeType: 'text/html', body: { data: b64url('<p>ignore me</p>') } },
					{ mimeType: 'text/plain', body: { data: b64url('the real body') } }
				]
			}
		};
		expect(messageText(msg)).toBe('Subject: Trip\n\nthe real body');
	});

	it('falls back to the snippet when there is no plain-text part', () => {
		const msg = {
			id: 'm3',
			snippet: 'a short preview',
			payload: {
				headers: [],
				mimeType: 'text/html',
				body: { data: b64url('<p>x</p>') }
			}
		};
		expect(messageText(msg)).toBe('a short preview');
	});

	it('caps the body length', () => {
		const msg = {
			id: 'm4',
			payload: {
				headers: [],
				mimeType: 'text/plain',
				body: { data: b64url('x'.repeat(5000)) }
			}
		};
		expect(messageText(msg, 100)).toHaveLength(100);
	});
});
