// Reply-suggestion helpers (M57). The route at
// /api/conversations/[slug]/suggestions asks Workers AI for a few short
// replies the reader might send next; this module turns that free-form
// bulleted reply into a clean list of strings.

// Parse the model's bulleted reply list into at most `max` trimmed, de-duped
// suggestion strings. The prompt asks for one reply per line starting with
// "- "; a stray leading number ("1. ") or wrapping quotes are stripped too.
export function parseSuggestions(text: string, max = 3): string[] {
	const out: string[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line.startsWith('-') && !line.startsWith('*')) continue;
		let s = line
			.replace(/^[-*]\s*/, '')
			.replace(/^\d+[.)]\s*/, '')
			.trim();
		// Drop a single layer of wrapping quotes the model sometimes adds.
		s = s.replace(/^["“'']\s*/, '').replace(/\s*["”'']$/, '').trim();
		if (s !== '' && !out.includes(s)) out.push(s);
		if (out.length >= max) break;
	}
	return out;
}
