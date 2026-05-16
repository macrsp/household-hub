// Inbound-SMS conversation routing.
//
// An SMS has no conversation field, so a sender names a non-default
// conversation with a leading "#<slug> " prefix (e.g. "#groceries need milk").
// The prefix is routing metadata — it is stripped from the stored message.
// Without a prefix, a message goes to the default `general` conversation.

export interface ParsedRoute {
	/** The conversation slug named by a `#slug` prefix, or null if none. */
	slug: string | null;
	/** The message body, with any routing prefix removed. */
	body: string;
}

// A prefix is `#`, a slug (alphanumeric, may contain hyphens), then at least
// one space, then a non-empty body. A bare `#word` with no following text is
// NOT a route — it is kept as the literal message.
const PREFIX = /^#([a-z0-9][a-z0-9-]*)\s+([\s\S]+)$/i;

export function parseConversationPrefix(raw: string): ParsedRoute {
	const m = raw.match(PREFIX);
	if (!m) return { slug: null, body: raw };
	return { slug: m[1].toLowerCase(), body: m[2].trim() };
}
