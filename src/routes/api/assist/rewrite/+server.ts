import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanRewrite } from '$lib/server/compose-assist';

// The Workers AI text model used to polish a draft message.
const REWRITE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// Drafts longer than this are rejected — compose-assist is for short messages.
const MAX_DRAFT = 2000;

// POST /api/assist/rewrite — polish a draft message with Cloudflare Workers AI
// (M58). Body: { text: non-empty string }. Returns { available, text } with
// the rewritten message, leaving the original draft for the caller to compare.
//
// Writes nothing to the database — it only transforms the supplied text. Gated
// like the other AI features: with no Workers AI binding (local/CI), or if the
// model call fails, it returns 503 { available: false } and the UI keeps the
// original draft untouched.
export const POST: RequestHandler = async ({ platform, request }) => {
	const raw = (await request.json().catch(() => null)) as { text?: unknown } | null;
	const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
	if (text === '') {
		throw error(400, 'Expected JSON body { text: non-empty string }');
	}
	if (text.length > MAX_DRAFT) {
		throw error(400, `Draft too long — keep it under ${MAX_DRAFT} characters`);
	}

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, text: '' }, { status: 503 });
	}

	const prompt = [
		`Rewrite this family chat message so it is clear, warm, and concise.`,
		`Keep the original meaning and any specific details (times, names,`,
		`places). Do not add new information. Reply with ONLY the rewritten`,
		`message — no preamble, no quotes, no explanation.`,
		``,
		`Message:`,
		text
	].join('\n');

	try {
		const result = (await ai.run(REWRITE_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You polish short messages for a family group chat.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const rewritten = cleanRewrite(result.response ?? '');
		if (rewritten === '') {
			return json({ available: false, text: '' }, { status: 503 });
		}
		return json({ available: true, text: rewritten });
	} catch (e) {
		console.error('[assist] Workers AI rewrite failed', e);
		return json({ available: false, text: '' }, { status: 503 });
	}
};
