import type { APIRequestContext } from '@playwright/test';
import { TEST_ROUTES_SECRET } from './test-config.mjs';

// Reset D1 to the fixed seed fixture via the gated test-only route, so each
// test starts from a known database state. Throws on any non-2xx response so
// a misconfigured test server fails loudly rather than running on stale data.
export async function resetDatabase(request: APIRequestContext): Promise<void> {
	const res = await request.post('/api/test/reset', {
		headers: { 'x-test-secret': TEST_ROUTES_SECRET }
	});
	if (!res.ok()) {
		throw new Error(`/api/test/reset failed: ${res.status()} ${await res.text()}`);
	}
}

// Post a message to a conversation and return its id.
export async function postMessage(
	request: APIRequestContext,
	options: { slug?: string; authorPersonId?: string; body?: string } = {}
): Promise<string> {
	const slug = options.slug ?? 'general';
	const res = await request.post(`/api/conversations/${slug}/messages`, {
		data: {
			authorPersonId: options.authorPersonId ?? 'person-matt',
			body: options.body ?? 'test message'
		}
	});
	if (res.status() !== 201) {
		throw new Error(`postMessage failed: ${res.status()} ${await res.text()}`);
	}
	return (await res.json()).id as string;
}
