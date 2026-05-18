// Pure presentation helpers for the conversation view. Extracted from
// +page.svelte (M32) so they can be unit-tested without a Svelte component
// harness — see message-format.test.ts.

/** One run of a message body: plain text, or a URL rendered as a link. */
export interface LinkSegment {
	link: boolean;
	value: string;
	href: string;
}

/**
 * Split a message body into plain-text and link segments so URLs can be
 * rendered as clickable links. The caller binds each segment as a text node
 * or an `<a>` attribute — never as raw HTML — so a body cannot inject markup.
 * Trailing sentence punctuation is trimmed off a matched URL.
 */
export function linkify(text: string): LinkSegment[] {
	const segments: LinkSegment[] = [];
	const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) {
			segments.push({ link: false, value: text.slice(last, m.index), href: '' });
		}
		let url = m[0];
		let trail = '';
		while (/[.,!?;:)\]]$/.test(url)) {
			trail = url.slice(-1) + trail;
			url = url.slice(0, -1);
		}
		if (url) {
			const href = /^www\./i.test(url) ? `https://${url}` : url;
			segments.push({ link: true, value: url, href });
		}
		if (trail) segments.push({ link: false, value: trail, href: '' });
		last = m.index + m[0].length;
	}
	if (last < text.length) {
		segments.push({ link: false, value: text.slice(last), href: '' });
	}
	return segments;
}

/** One run of a message body: plain text, a URL link, or an @mention. */
export type BodySegment =
	| { kind: 'text'; value: string }
	| { kind: 'link'; value: string; href: string }
	| { kind: 'mention'; value: string };

/**
 * Split a message body into text, link, and @mention segments (M46). URLs are
 * detected by `linkify`; within each text run, `@name` is a mention when
 * `name` (case-insensitive) is in `mentionNames`. An `@word` that matches no
 * household member stays plain text. Every segment is bound as text or an
 * attribute by the caller — never raw HTML — so a body cannot inject markup.
 */
export function parseBody(text: string, mentionNames: string[]): BodySegment[] {
	const names = new Set(mentionNames.map((n) => n.toLowerCase()));
	const out: BodySegment[] = [];
	for (const seg of linkify(text)) {
		if (seg.link) {
			out.push({ kind: 'link', value: seg.value, href: seg.href });
			continue;
		}
		const re = /@([A-Za-z0-9][A-Za-z0-9_-]*)/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(seg.value)) !== null) {
			if (!names.has(m[1].toLowerCase())) continue;
			if (m.index > last) out.push({ kind: 'text', value: seg.value.slice(last, m.index) });
			out.push({ kind: 'mention', value: m[0] });
			last = m.index + m[0].length;
		}
		if (last < seg.value.length) out.push({ kind: 'text', value: seg.value.slice(last) });
	}
	return out;
}

/** A stable hue (0–359) derived from a key, so each person keeps one colour. */
export function personHue(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
	return h;
}

/** The uppercase first character of a name, for an avatar; '?' when blank. */
export function initial(name: string): string {
	return (name.trim()[0] ?? '?').toUpperCase();
}

/** A calendar-day key for grouping messages under date dividers. */
export function dayKey(iso: string): string {
	return new Date(iso).toDateString();
}

/**
 * Divider text for a message's day: 'Today' / 'Yesterday' relative to `now`
 * (defaulting to the current time), otherwise a weekday + date. `now` is a
 * parameter so the relative branches are deterministically testable.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
	const d = new Date(iso);
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (d.toDateString() === now.toDateString()) return 'Today';
	if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
	return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * A short relative time for a message, e.g. 'now', '5m', '3h', '2d', relative
 * to `now` (defaulting to the current time). Beyond a week it falls back to a
 * 'Mon D' calendar date. A future timestamp (clock skew) reads as 'now'.
 * `now` is a parameter so the buckets are deterministically testable.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
	const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
	if (seconds < 45) return 'now';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d`;
	return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
