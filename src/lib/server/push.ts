/// <reference types="@cloudflare/workers-types" />
//
// Web Push transport (M38). Sends a payload-less "tickle" push: the push
// carries no body, so it needs only a signed VAPID JWT — no RFC 8291 payload
// encryption. The service worker's `push` handler shows a generic "new
// message" notification on receipt.
//
// Like the SMS and email adapters, this is gated: with no VAPID environment
// configured every function is a safe no-op, so the feature ships inert until
// the operator runs `node scripts/gen-vapid-keys.mjs` and sets the values.

import { listPushSubscriptions, deletePushSubscription } from './db';

interface PushEnv {
	VAPID_PUBLIC_KEY?: string; // base64url uncompressed EC point
	VAPID_PRIVATE_KEY?: string; // JWK JSON string of the EC private key
	VAPID_SUBJECT?: string; // mailto:… or https://…
}

/** Whether the VAPID environment is fully configured. */
export function pushConfigured(env: unknown): boolean {
	const e = env as PushEnv;
	return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
}

/** The VAPID public key the browser needs to subscribe, or null if unset. */
export function vapidPublicKey(env: unknown): string | null {
	return (env as PushEnv).VAPID_PUBLIC_KEY ?? null;
}

function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlString(text: string): string {
	return base64url(new TextEncoder().encode(text));
}

// Build and sign a VAPID JWT (RFC 8292) for one push-service audience.
async function vapidJwt(env: PushEnv, audience: string): Promise<string> {
	const header = base64urlString(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
	const payload = base64urlString(
		JSON.stringify({
			aud: audience,
			exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
			sub: env.VAPID_SUBJECT
		})
	);
	const signingInput = `${header}.${payload}`;

	const key = await crypto.subtle.importKey(
		'jwk',
		JSON.parse(env.VAPID_PRIVATE_KEY as string),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		new TextEncoder().encode(signingInput)
	);
	return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/**
 * Send one payload-less push to a subscription endpoint. Returns:
 *   'sent'   — the push service accepted it,
 *   'gone'   — the subscription is expired (404/410); the caller should prune,
 *   'failed' — a transient error.
 */
export async function sendPush(
	env: unknown,
	endpoint: string
): Promise<'sent' | 'gone' | 'failed'> {
	const e = env as PushEnv;
	if (!pushConfigured(e)) return 'failed';

	const url = new URL(endpoint);
	const jwt = await vapidJwt(e, `${url.protocol}//${url.host}`);

	const res = await fetch(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `vapid t=${jwt}, k=${e.VAPID_PUBLIC_KEY}`,
			TTL: '86400'
		}
	});
	if (res.status === 404 || res.status === 410) return 'gone';
	return res.ok ? 'sent' : 'failed';
}

/**
 * Push a new-message notification to every subscribed device except the
 * author's own. Each subscription is attempted independently — a per-iteration
 * try/catch keeps one failed push from blocking the rest (PLANS.md invariant
 * 2). An expired subscription is pruned. A no-op when push is not configured.
 */
export async function notifyPushSubscribers(
	env: unknown,
	db: D1Database,
	authorPersonId: string
): Promise<void> {
	if (!pushConfigured(env)) return;
	const subscriptions = await listPushSubscriptions(db);
	for (const sub of subscriptions) {
		if (sub.person_id === authorPersonId) continue;
		try {
			const result = await sendPush(env, sub.endpoint);
			if (result === 'gone') await deletePushSubscription(db, sub.id);
		} catch (err) {
			console.error('[push] failed for subscription', sub.id, err);
		}
	}
}
