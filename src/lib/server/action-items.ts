// Action-item extraction helpers (M56). The route at
// /api/conversations/[slug]/actions asks Workers AI for a bulleted list of
// to-dos; this module turns that free-form reply into structured items.

export interface ActionItem {
	// The person responsible, if the model could identify one ('' otherwise).
	assignee: string;
	// The thing to be done.
	task: string;
}

// Pull bulleted lines out of the model's free-form reply. The prompt asks for
// one item per line starting with "- "; anything else (preamble, blank lines)
// is dropped. An item may carry a "[Name]" assignee prefix.
export function parseActions(text: string): ActionItem[] {
	const out: ActionItem[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line.startsWith('-') && !line.startsWith('*')) continue;
		let task = line.replace(/^[-*]\s*/, '').trim();
		if (task === '') continue;
		// A bullet that is only a "[Name]" tag carries no actual task — drop it.
		if (/^\[[^\]]+\]$/.test(task)) continue;
		let assignee = '';
		const tagged = task.match(/^\[([^\]]+)\]\s*(.+)$/);
		if (tagged) {
			assignee = tagged[1].trim();
			task = tagged[2].trim();
		}
		if (task !== '') out.push({ assignee, task });
	}
	return out;
}
