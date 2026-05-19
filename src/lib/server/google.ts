/// <reference types="@cloudflare/workers-types" />
//
// Google OAuth + Gmail client (M74). This module owns everything the Gmail
// connection needs: encrypting the OAuth tokens at rest, building the consent
// URL, exchanging the authorization code, refreshing an expired access token,
// and a thin read-only Gmail API client.
//
// Gating: `googleConfigured` is false unless all three secrets are present
// (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY). Local and CI
// have none, so the /api/google/* routes report Gmail unconfigured there.

import type { GoogleAccountRow } from './db';

type Env = App.Platform['env'];

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// The scopes requested at the consent screen: read-only Gmail, plus the
// non-sensitive openid/email so the callback can identify which account
// connected. Read-only is the narrowest scope that supports fact extraction.
const SCOPES = 'openid email https://www.googleapis.com/auth/gmail.readonly';

/** True only when every Google secret is configured. */
export function googleConfigured(env: Env): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

// --- Token encryption at rest (AES-GCM) ----------------------------------

async function aesKey(keyB64: string): Promise<CryptoKey> {
	const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
	return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt'
	]);
}

/** Encrypt a token for storage. Output is base64(iv ‖ ciphertext). */
export async function encryptToken(keyB64: string, plaintext: string): Promise<string> {
	const key = await aesKey(keyB64);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
	);
	const out = new Uint8Array(iv.length + ct.length);
	out.set(iv);
	out.set(ct, iv.length);
	return btoa(String.fromCharCode(...out));
}

/** Decrypt a token produced by `encryptToken`. */
export async function decryptToken(keyB64: string, payloadB64: string): Promise<string> {
	const key = await aesKey(keyB64);
	const bytes = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
	const iv = bytes.slice(0, 12);
	const ct = bytes.slice(12);
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
	return new TextDecoder().decode(pt);
}

// --- Signed OAuth state (CSRF + carries the personId) --------------------

function b64urlEncode(s: string): string {
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
	return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

/**
 * Build a tamper-proof `state` value carrying the connecting member's id. It
 * is HMAC-signed with the client secret and timestamped, so the callback can
 * trust the personId and reject a stale or forged state.
 */
export async function signState(secret: string, personId: string): Promise<string> {
	const enc = b64urlEncode(JSON.stringify({ p: personId, t: Date.now() }));
	const key = await hmacKey(secret);
	const sig = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(enc))
	);
	return `${enc}.${b64urlEncode(String.fromCharCode(...sig))}`;
}

/** Verify a `state` and return its personId, or null if invalid or stale. */
export async function verifyState(
	secret: string,
	state: string,
	maxAgeMs = 600_000
): Promise<string | null> {
	const parts = state.split('.');
	if (parts.length !== 2) return null;
	try {
		const key = await hmacKey(secret);
		const sig = Uint8Array.from(b64urlDecode(parts[1]), (c) => c.charCodeAt(0));
		const ok = await crypto.subtle.verify(
			'HMAC',
			key,
			sig,
			new TextEncoder().encode(parts[0])
		);
		if (!ok) return null;
		const payload = JSON.parse(b64urlDecode(parts[0])) as { p?: unknown; t?: unknown };
		if (typeof payload.p !== 'string' || typeof payload.t !== 'number') return null;
		if (Date.now() - payload.t > maxAgeMs) return null;
		return payload.p;
	} catch {
		return null;
	}
}

// --- OAuth flow ----------------------------------------------------------

/** The redirect URI registered with Google — derived from the public app URL. */
export function redirectUri(env: Env): string {
	const base = env.PUBLIC_APP_URL ?? 'https://household.practicepartner.app';
	return `${base.replace(/\/$/, '')}/api/google/callback`;
}

/** The Google consent-screen URL to redirect a connecting member to. */
export function buildAuthUrl(env: Env, state: string): string {
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID as string,
		redirect_uri: redirectUri(env),
		response_type: 'code',
		scope: SCOPES,
		access_type: 'offline', // ask for a refresh token
		prompt: 'consent', // force the refresh token to be re-issued
		include_granted_scopes: 'true',
		state
	});
	return `${AUTH_ENDPOINT}?${params}`;
}

export interface GoogleTokens {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope?: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(env: Env, code: string): Promise<GoogleTokens> {
	const res = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID as string,
			client_secret: env.GOOGLE_CLIENT_SECRET as string,
			redirect_uri: redirectUri(env),
			grant_type: 'authorization_code'
		})
	});
	if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
	return (await res.json()) as GoogleTokens;
}

/** Use a refresh token to obtain a new access token. */
export async function refreshAccessToken(env: Env, refreshToken: string): Promise<GoogleTokens> {
	const res = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID as string,
			client_secret: env.GOOGLE_CLIENT_SECRET as string,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		})
	});
	if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
	return (await res.json()) as GoogleTokens;
}

/** Best-effort revoke a token at Google (used on disconnect). */
export async function revokeToken(token: string): Promise<void> {
	try {
		await fetch(REVOKE_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ token })
		});
	} catch (e) {
		console.error('[google] token revoke failed', e);
	}
}

// --- Gmail API client (read-only) ----------------------------------------

/** The connected mailbox's address and current history id. */
export async function gmailProfile(
	accessToken: string
): Promise<{ emailAddress: string; historyId: string }> {
	const res = await fetch(`${GMAIL_BASE}/profile`, {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error(`Gmail profile request failed: ${res.status}`);
	return (await res.json()) as { emailAddress: string; historyId: string };
}

// --- Token refresh + Gmail message reading (M75) -------------------------

/**
 * Return a usable access token for a connected account, refreshing it first
 * if it is within a minute of expiry. A refresh re-encrypts and persists the
 * new token. The plaintext token exists only in memory, for the caller's
 * immediate Gmail request.
 */
export async function freshAccessToken(
	env: Env,
	db: D1Database,
	account: GoogleAccountRow
): Promise<string> {
	const key = env.TOKEN_ENCRYPTION_KEY as string;
	if (Date.parse(account.token_expiry) > Date.now() + 60_000) {
		return decryptToken(key, account.access_token);
	}
	const refresh = await decryptToken(key, account.refresh_token);
	const tokens = await refreshAccessToken(env, refresh);
	const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
	await db
		.prepare('UPDATE google_accounts SET access_token = ?, token_expiry = ? WHERE id = ?')
		.bind(await encryptToken(key, tokens.access_token), expiry, account.id)
		.run();
	return tokens.access_token;
}

interface GmailPart {
	mimeType?: string;
	body?: { data?: string };
	parts?: GmailPart[];
}

export interface GmailMessage {
	id: string;
	snippet?: string;
	payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
}

/** The ids of messages received in the last day (the sync window). */
export async function listRecentMessageIds(accessToken: string, max = 25): Promise<string[]> {
	const url = `${GMAIL_BASE}/messages?q=${encodeURIComponent('newer_than:1d')}&maxResults=${max}`;
	const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
	if (!res.ok) throw new Error(`Gmail messages.list failed: ${res.status}`);
	const data = (await res.json()) as { messages?: Array<{ id: string }> };
	return (data.messages ?? []).map((m) => m.id);
}

/** Fetch one full message. */
export async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
	const res = await fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
		headers: { authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error(`Gmail messages.get failed: ${res.status}`);
	return (await res.json()) as GmailMessage;
}

function decodeB64Url(data: string): string {
	const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
	return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function findPlainText(part: GmailPart | undefined): string {
	if (!part) return '';
	if (part.mimeType === 'text/plain' && part.body?.data) {
		try {
			return decodeB64Url(part.body.data);
		} catch {
			return '';
		}
	}
	for (const child of part.parts ?? []) {
		const found = findPlainText(child);
		if (found) return found;
	}
	return '';
}

/**
 * Render a Gmail message as plain text for fact extraction: the Subject line
 * plus the plain-text body, or the short snippet when there is no plain-text
 * part. The body is capped so the extraction prompt stays bounded. Pure —
 * unit-tested.
 */
export function messageText(message: GmailMessage, maxBody = 4000): string {
	const subject =
		message.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
	let body = findPlainText(message.payload);
	if (body.trim() === '') body = message.snippet ?? '';
	body = body.trim().slice(0, maxBody);
	return subject ? `Subject: ${subject}\n\n${body}` : body;
}
