import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanRewrite } from '$lib/server/compose-assist';
import { resolveLanguage } from '$lib/server/translate';

// The Workers AI text model used to translate a message.
const TRANSLATE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// Messages longer than this are rejected — translation is for chat messages.
const MAX_TEXT = 2000;

// POST /api/assist/translate — translate a message into another language with
// Cloudflare Workers AI (M60). Body: { text: non-empty string, to?: string }.
// Returns { available, text, language }.
//
// Stateless — writes nothing. Gated like compose-assist (M58): an empty or
// over-long `text` is a 400; with no Workers AI binding (local/CI), or if the
// model call fails, it returns 503 { available: false }.
export const POST: RequestHandler = async ({ platform, request }) => {
	const raw = (await request.json().catch(() => null)) as
		| { text?: unknown; to?: unknown }
		| null;
	const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
	if (text === '') {
		throw error(400, 'Expected JSON body { text: non-empty string, to?: string }');
	}
	if (text.length > MAX_TEXT) {
		throw error(400, `Message too long — keep it under ${MAX_TEXT} characters`);
	}
	const language = resolveLanguage(raw?.to);

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, text: '', language }, { status: 503 });
	}

	const prompt = [
		`Translate this family chat message into ${language}.`,
		`Keep the tone natural and preserve any names, times, and places.`,
		`If it is already in ${language}, return it unchanged.`,
		`Reply with ONLY the translation — no preamble, no quotes, no notes.`,
		``,
		`Message:`,
		text
	].join('\n');

	try {
		const result = (await ai.run(TRANSLATE_MODEL, {
			messages: [
				{
					role: 'system',
					content: `You translate short family chat messages into ${language}.`
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const translated = cleanRewrite(result.response ?? '');
		if (translated === '') {
			return json({ available: false, text: '', language }, { status: 503 });
		}
		return json({ available: true, text: translated, language });
	} catch (e) {
		console.error('[assist] Workers AI translate failed', e);
		return json({ available: false, text: '', language }, { status: 503 });
	}
};
