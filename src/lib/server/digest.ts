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
