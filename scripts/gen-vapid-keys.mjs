#!/usr/bin/env node
//
// Generate a VAPID key pair for Web Push (M38). Run once:
//
//   node scripts/gen-vapid-keys.mjs
//
// The keys are self-generated — an EC P-256 key pair, not tied to any account
// or paid service. Set the three values it prints as the household-hub Pages
// environment:
//
//   VAPID_PUBLIC_KEY   — a plain var (it is public)
//   VAPID_PRIVATE_KEY  — a secret  (wrangler pages secret put VAPID_PRIVATE_KEY)
//   VAPID_SUBJECT      — a plain var, e.g. mailto:you@example.com
//
// Web push stays inert (the /api/push routes report "not configured") until
// all three are present — the same gated pattern as the SMS and email
// adapters.

import { webcrypto } from 'node:crypto';

const pair = await webcrypto.subtle.generateKey(
	{ name: 'ECDSA', namedCurve: 'P-256' },
	true,
	['sign', 'verify']
);
const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);

// The VAPID public key is the uncompressed EC point (0x04 || X || Y),
// base64url-encoded — the form the browser's PushManager and the `k=`
// Authorization parameter expect.
const fromB64Url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const point = Buffer.concat([
	Buffer.from([0x04]),
	fromB64Url(publicJwk.x),
	fromB64Url(publicJwk.y)
]);

console.log('VAPID_PUBLIC_KEY  =', point.toString('base64url'));
console.log('VAPID_PRIVATE_KEY =', JSON.stringify(privateJwk));
console.log('VAPID_SUBJECT     = mailto:north0401@gmail.com');
