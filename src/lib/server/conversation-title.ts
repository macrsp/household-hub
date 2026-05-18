// Conversation auto-title helpers (M59). The route at
// /api/conversations/[slug]/title-suggestion asks Workers AI for a name; this
// module reduces the model's free-form reply to a single clean title.

// Take the first non-empty line of the model's reply and strip a leading
// bullet or numbering, a layer of wrapping quotes, and a trailing period,
// then cap it to a sensible length.
export function cleanTitle(text: string, max = 60): string {
	const first =
		text
			.split('\n')
			.map((l) => l.trim())
			.find((l) => l !== '') ?? '';
	let title = first
		.replace(/^[-*]\s*/, '')
		.replace(/^\d+[.)]\s*/, '')
		.trim();
	title = title.replace(/^["“'']\s*/, '').replace(/\s*["”'']$/, '').trim();
	title = title.replace(/\.+$/, '').trim();
	if (title.length > max) title = title.slice(0, max).trim();
	return title;
}
