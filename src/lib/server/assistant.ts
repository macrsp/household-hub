/// <reference types="@cloudflare/workers-types" />
//
// In-app @claude assistant (M55). When a household member @-mentions Claude in
// an ordinary conversation, this generates a short reply with Cloudflare
// Workers AI and posts it back as the `person-claude` member.
//
// This is distinct from the #claude dev channel (M52/M53): that channel's
// requests go to the external Claude Code runner. The in-app assistant is for
// every *other* conversation and answers questions, not code changes.

import { insertMessage, type Message } from './db';
import { fanoutMessage } from './fanout';
import { relevantMessageIds } from './semantic-index';

const ASSISTANT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const CLAUDE_PERSON_ID = 'person-claude';
const DEV_CHANNEL_SLUG = 'claude';
// Recent messages fed to the model for context, plus the messages most
// relevant to the question retrieved from anywhere in the conversation (M69).
const CONTEXT_WINDOW = 16;
const RELEVANT_K = 12;

interface ContextRow {
	id: string;
	body: string;
	author_name: string;
	created_at: string;
}

/** Whether a message body @-mentions Claude. */
export function mentionsClaude(body: string): boolean {
	return /@claude\b/i.test(body);
}

/**
 * If `message` @-mentions Claude in an ordinary conversation, generate a reply
 * with Workers AI and post it as `person-claude`. Best-effort: any failure is
 * logged and dropped — the member's own message is already stored, and the
 * assistant reply is a secondary convenience, not a user-asset write. Safe to
 * call for every posted message; it no-ops unless every condition holds.
 *
 * Intended to run via `waitUntil` so it never delays the send response.
 */
export async function maybeAssistantReply(
	env: App.Platform['env'],
	db: D1Database,
	conversation: { id: string; slug: string },
	message: Message
): Promise<void> {
	// Skip: the dev channel (runner territory), Claude's own posts (no loops),
	// non-mentions, and when Workers AI is not configured.
	if (conversation.slug === DEV_CHANNEL_SLUG) return;
	if (message.author_person_id === CLAUDE_PERSON_ID) return;
	if (!mentionsClaude(message.body)) return;
	const ai = env.AI;
	if (!ai) return;

	try {
		// Recent context (oldest-first), excluding deleted messages.
		const recent = await db
			.prepare(
				`SELECT id, body, author_name, created_at FROM (
				   SELECT m.id, m.body, p.display_name AS author_name, m.created_at
				   FROM messages m
				   JOIN people p ON p.id = m.author_person_id
				   WHERE m.conversation_id = ? AND m.deleted_at IS NULL
				   ORDER BY m.created_at DESC
				   LIMIT ${CONTEXT_WINDOW}
				 )
				 ORDER BY created_at ASC`
			)
			.bind(conversation.id)
			.all<ContextRow>();

		// Plus the messages most relevant to the question, from anywhere in the
		// conversation (M69) — best-effort, empty without Vectorize. The
		// triggering message is excluded: it may not be indexed yet, and it is
		// already in the recent window.
		let relevant: ContextRow[] = [];
		const relevantIds = await relevantMessageIds(env, conversation.id, message.body, RELEVANT_K);
		const recentIds = new Set(recent.results.map((r) => r.id));
		const extraIds = relevantIds.filter((id) => !recentIds.has(id) && id !== message.id);
		if (extraIds.length > 0) {
			const placeholders = extraIds.map(() => '?').join(',');
			const r = await db
				.prepare(
					`SELECT m.id, m.body, p.display_name AS author_name, m.created_at
					 FROM messages m
					 JOIN people p ON p.id = m.author_person_id
					 WHERE m.deleted_at IS NULL AND m.id IN (${placeholders})`
				)
				.bind(...extraIds)
				.all<ContextRow>();
			relevant = r.results;
		}

		// Merge relevant + recent, de-duped, in chronological order.
		const transcript = [...relevant, ...recent.results]
			.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
			.map((m) => `${m.author_name}: ${m.body}`)
			.join('\n');

		const result = (await ai.run(ASSISTANT_MODEL, {
			messages: [
				{
					role: 'system',
					content:
						'You are Claude, a friendly assistant in a family group chat. ' +
						'Keep replies short, warm, and genuinely helpful. Answer the most ' +
						'recent message. Do not invent household details you were not told.'
				},
				{
					role: 'user',
					content: `Recent conversation:\n${transcript}\n\nReply to the most recent message.`
				}
			]
		})) as { response?: string };

		const reply = (result.response ?? '').trim();
		if (reply === '') return;

		const replyMessage: Message = {
			id: crypto.randomUUID(),
			conversation_id: conversation.id,
			author_person_id: CLAUDE_PERSON_ID,
			body: reply,
			source_transport: 'app',
			created_at: new Date().toISOString(),
			// Thread the reply under the message that mentioned Claude, so it
			// renders attached to the question (M42 reply rendering) — M65.
			reply_to_message_id: message.id
		};
		await insertMessage(db, replyMessage);
		await fanoutMessage(db, env, replyMessage.id);
	} catch (e) {
		console.error('[assistant] reply failed', e);
	}
}
