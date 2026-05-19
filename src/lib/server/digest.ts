// Household-digest helpers (M61, M79). The digest gathers recent messages
// across every active conversation into an AI summary, and — since M79 — also
// reports what is coming up on the calendar and what memory facts are waiting
// for review, so the daily digest reads as a real household briefing.

import { datedFacts, proposedFactsWithNames, type FactWithNames } from './db';

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

// How many days ahead the digest's "coming up" section looks.
const DIGEST_HORIZON_DAYS = 7;

// Filter dated memory facts to those happening from today through the next
// week — the digest's "coming up" section. Pure; unit-tested.
export function upcomingFacts(facts: FactWithNames[], now: Date = new Date()): FactWithNames[] {
	const today = now.toISOString().slice(0, 10);
	const horizon = new Date(now.getTime() + DIGEST_HORIZON_DAYS * 86_400_000)
		.toISOString()
		.slice(0, 10);
	return facts.filter((f) => {
		if (!f.valid_at) return false;
		const day = f.valid_at.slice(0, 10);
		return day >= today && day <= horizon;
	});
}

// The Workers AI text model used to write the household digest.
const DIGEST_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How far back the digest looks, and how many messages it will read.
const DIGEST_HOURS = 24;
const DIGEST_LIMIT = 80;

// Generate the household digest — an AI summary of the last day's activity,
// followed by what is coming up on the calendar and what memory facts await
// review (M61, M79). Shared by GET /api/digest and POST /api/digest/post.
//
// Returns { available: false } only when the model call fails on a day that
// had conversation activity to summarise. A quiet day with nothing at all is
// the non-failure { available: true, digest: '' }.
export async function generateDigest(
	ai: Ai,
	db: D1Database
): Promise<{ available: boolean; digest: string }> {
	const sections: string[] = [];

	// 1. The AI summary of recent conversation activity.
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

	if (results.length > 0) {
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
			const summary = (result.response ?? '').trim();
			if (summary !== '') sections.push(summary);
		} catch (e) {
			console.error('[digest] Workers AI call failed', e);
			return { available: false, digest: '' };
		}
	}

	// 2. Coming up — confirmed dated facts in the next week.
	const upcoming = upcomingFacts(await datedFacts(db));
	if (upcoming.length > 0) {
		const lines = upcoming.map((f) => {
			const object = f.object_text ?? f.object_name ?? '';
			return `- ${f.valid_at}: ${f.subject_name} ${f.predicate.replace(/_/g, ' ')} ${object}`.trimEnd();
		});
		sections.push(`📅 Coming up:\n${lines.join('\n')}`);
	}

	// 3. To review — memory facts the AI proposed and nobody has confirmed yet.
	const proposedCount = (await proposedFactsWithNames(db)).length;
	if (proposedCount > 0) {
		const noun = proposedCount === 1 ? 'fact is' : 'facts are';
		sections.push(
			`📋 ${proposedCount} household ${noun} waiting for review on the Household page.`
		);
	}

	return { available: true, digest: sections.join('\n\n') };
}
