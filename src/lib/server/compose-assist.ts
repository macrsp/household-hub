// Compose-assist helpers (M58). The route at POST /api/assist/rewrite asks
// Workers AI to polish a draft message; this module cleans the model's reply
// down to just the rewritten text.

// Strip the chatty preamble and wrapping quotes a model sometimes adds around
// a rewritten message, leaving just the message itself. A short first line
// ending in a colon ("Here is a polished version:") is treated as preamble
// and dropped when more text follows.
export function cleanRewrite(text: string): string {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '');
	if (lines.length > 1 && lines[0].length < 80 && /[:：]$/.test(lines[0])) {
		lines.shift();
	}
	let out = lines.join('\n').trim();
	// Drop a single layer of wrapping quotes.
	out = out.replace(/^["“'']\s*/, '').replace(/\s*["”'']$/, '').trim();
	return out;
}
