/// <reference types="@cloudflare/workers-types" />
//
// AI fact extraction for the household memory graph. After a message is posted
// (M73), or an email is read during a Gmail sync (M75), this asks Workers AI
// whether the text states any durable household fact and stores each candidate
// as a *proposed* fact — one a member must confirm before it becomes
// answerable.

import { upsertEntity, insertFact, type Message } from './db';

const EXTRACT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const CLAUDE_PERSON_ID = 'person-claude';
const DEV_CHANNEL_SLUG = 'claude';
// At most this many candidate facts are taken from one text.
const MAX_FACTS = 5;
// The confidence stamped on an AI-extracted candidate.
const EXTRACT_CONFIDENCE = 0.6;

// Parse the model's reply: one fact per line as `subject | predicate | object`.
// Anything that is not a clean three-field line is dropped. Returns at most
// MAX_FACTS triples.
export function parseExtractedFacts(
	text: string
): { subject: string; predicate: string; object: string }[] {
	const out: { subject: string; predicate: string; object: string }[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (line === '' || /^none\b/i.test(line)) continue;
		const parts = line.replace(/^[-*\d.)\s]+/, '').split('|');
		if (parts.length !== 3) continue;
		const subject = parts[0].trim();
		const predicate = parts[1].trim().toLowerCase().replace(/\s+/g, '_');
		const object = parts[2].trim();
		if (subject === '' || predicate === '' || object === '') continue;
		out.push({ subject, predicate, object });
		if (out.length >= MAX_FACTS) break;
	}
	return out;
}

// The provenance attached to the proposed facts of one extraction run.
interface ExtractionRefs {
	source: 'conversation' | 'email';
	source_message_id?: string;
	source_ref?: string;
}

// Ask the model to extract household facts from `text` and store each as a
// proposed fact. Returns the number stored. Throws on a model or DB failure —
// the callers wrap it (extraction is best-effort, never a silent user-asset
// fallback: each insert here either succeeds or throws).
async function runExtraction(
	env: App.Platform['env'],
	text: string,
	refs: ExtractionRefs
): Promise<number> {
	const ai = env.AI;
	if (!ai) return 0;

	const prompt = [
		`Read this text and list any durable household facts it states —`,
		`things worth remembering long-term: names, relationships, dates,`,
		`appointments, codes and passwords, sizes, preferences, schedules.`,
		`Output one fact per line as: subject | predicate | object`,
		`Use a short snake_case predicate. Do not invent anything. If the text`,
		`states no durable fact, reply with exactly NONE.`,
		``,
		`Text: ${text}`
	].join('\n');

	const result = (await ai.run(EXTRACT_MODEL, {
		messages: [
			{ role: 'system', content: 'You extract durable household facts from text.' },
			{ role: 'user', content: prompt }
		]
	})) as { response?: string };

	const candidates = parseExtractedFacts(result.response ?? '');
	for (const c of candidates) {
		const subjectEntity = await upsertEntity(env.DB, { kind: 'thing', name: c.subject });
		await insertFact(env.DB, {
			subject_id: subjectEntity.id,
			predicate: c.predicate,
			object_text: c.object,
			confidence: EXTRACT_CONFIDENCE,
			status: 'proposed',
			source: refs.source,
			source_message_id: refs.source_message_id,
			source_ref: refs.source_ref
		});
	}
	return candidates.length;
}

// Extract candidate facts from a posted conversation message (M73).
// Best-effort and self-gating: a no-op in the dev channel, for Claude's own
// messages, and when Workers AI is absent. Intended to run via waitUntil.
export async function extractFacts(
	env: App.Platform['env'],
	conversation: { id: string; slug: string },
	message: Message
): Promise<void> {
	if (conversation.slug === DEV_CHANNEL_SLUG) return;
	if (message.author_person_id === CLAUDE_PERSON_ID) return;
	const body = message.body.trim();
	if (body.length < 8) return; // too short to carry a durable fact

	try {
		await runExtraction(env, body, {
			source: 'conversation',
			source_message_id: message.id
		});
	} catch (e) {
		console.error('[memory] fact extraction failed for message', message.id, e);
	}
}

// Extract candidate facts from one email's text (M75). `gmailMessageId` is
// stored as the fact's `source_ref` so a later sync can skip an email already
// processed. Returns the number of proposed facts stored.
export async function extractEmailFacts(
	env: App.Platform['env'],
	text: string,
	gmailMessageId: string
): Promise<number> {
	return runExtraction(env, text, { source: 'email', source_ref: gmailMessageId });
}
