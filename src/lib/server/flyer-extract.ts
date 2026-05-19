/// <reference types="@cloudflare/workers-types" />
//
// Snap-a-flyer extraction (M80). An adult photographs a flyer, notice, or
// invitation; a Workers AI vision model reads it and any events it announces
// are stored as proposed memory facts — entering the same M73 propose→confirm
// loop, and (when dated, M78) the M76 calendar. The image is processed
// transiently and never stored.

import { parseExtractedFacts, storeProposedFacts } from './memory-extract';

// The Workers AI vision model: it reads printed text in a photo and follows an
// extraction instruction.
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

// Extract events from a flyer image and store them as proposed facts. Returns
// the number proposed. Best-effort and self-gating: a no-op returning 0 when
// Workers AI is absent (local/CI) or the model call fails. The image bytes are
// used only for the model call and are not persisted anywhere.
export async function extractFlyerFacts(
	env: App.Platform['env'],
	imageBytes: Uint8Array
): Promise<number> {
	const ai = env.AI;
	if (!ai) return 0;

	try {
		const prompt = [
			`This is a photo of a flyer, notice, invitation, or appointment card.`,
			`Extract any events it announces. Output one event per line as:`,
			`subject | predicate | object | date`,
			`with the date in YYYY-MM-DD form — for example:`,
			`Lincoln Elementary | field_trip | the zoo | 2026-06-02`,
			`Use a short snake_case predicate. Do not invent anything not shown`,
			`in the image. If there is no event, reply with exactly NONE.`
		].join('\n');

		const result = (await ai.run(VISION_MODEL, {
			prompt,
			image: [...imageBytes]
		})) as { response?: string };

		return await storeProposedFacts(env, parseExtractedFacts(result.response ?? ''), {
			source: 'flyer'
		});
	} catch (e) {
		console.error('[flyer] extraction failed', e);
		return 0;
	}
}
