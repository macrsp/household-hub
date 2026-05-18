// Household-digest helpers (M61). The route at GET /api/digest gathers recent
// messages across every active conversation; this module groups them into a
// single transcript the model can read.

export interface DigestRow {
	conversation_name: string;
	author_name: string;
	body: string;
}

// Group recent messages by conversation into one transcript with a "## Name"
// header per conversation. Conversations keep the order of their first message
// in `rows`, which the query supplies oldest-first.
export function formatDigestSections(rows: DigestRow[]): string {
	const sections: string[] = [];
	const indexByName = new Map<string, number>();
	for (const row of rows) {
		let idx = indexByName.get(row.conversation_name);
		if (idx === undefined) {
			idx = sections.length;
			indexByName.set(row.conversation_name, idx);
			sections.push(`## ${row.conversation_name}`);
		}
		sections[idx] += `\n${row.author_name}: ${row.body}`;
	}
	return sections.join('\n\n');
}

// The ISO timestamp `hours` hours before `now` — the lower bound of the digest
// window. Defaults to 24 hours and to the current time.
export function digestSince(hours = 24, now: Date = new Date()): string {
	return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

// The Workers AI text model used to write the household digest.
const DIGEST_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How far back the digest looks, and how many messages it will read.
const DIGEST_HOURS = 24;
const DIGEST_LIMIT = 80;

// Generate the household digest — an AI summary of the last day's activity
// across every active conversation (M61). Shared by GET /api/digest (M61) and
// POST /api/digest/post (M63).
//
// Returns { available: false } when the model call fails, and a non-failure
// { available: true, digest: '' } when nothing happened in the window.
export async function generateDigest(
	ai: Ai,
	db: D1Database
): Promise<{ available: boolean; digest: string }> {
	// Recent readable messages across all non-archived conversations,
	// oldest-first so each conversation reads in order.
	const { results } = await db
		.prepare(
			`SELECT c.name AS conversation_name, p.display_name AS author_name, m.body
			 FROM messages m
			 JOIN conversations c ON c.id = m.conversation_id
			 JOIN people p ON p.id = m.author_person_id
			 WHERE m.deleted_at IS NULL
			   AND c.archived_at IS NULL
			   AND m.created_at > ?
			 ORDER BY m.created_at ASC
			 LIMIT ${DIGEST_LIMIT}`
		)
		.bind(digestSince(DIGEST_HOURS))
		.all<DigestRow>();

	// Nothing happened in the window — not a failure, just an empty digest.
	if (results.length === 0) {
		return { available: true, digest: '' };
	}

	const prompt = [
		`Summarise what happened across these family conversations in the last`,
		`day. Group the summary by conversation, one short paragraph each, and`,
		`call out any plans, decisions, or things someone needs to do. Be`,
		`concise and do not invent anything not in the messages.`,
		``,
		formatDigestSections(results)
	].join('\n');

	try {
		const result = (await ai.run(DIGEST_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You write a brief daily digest of a family’s group chats.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const digest = (result.response ?? '').trim();
		return { available: digest !== '', digest };
	} catch (e) {
		console.error('[digest] Workers AI call failed', e);
		return { available: false, digest: '' };
	}
}
