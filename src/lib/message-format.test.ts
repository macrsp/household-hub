import { describe, it, expect } from 'vitest';
import { linkify, personHue, initial, dayKey, dayLabel } from './message-format';

describe('linkify', () => {
	it('returns one text segment for a body with no URL', () => {
		expect(linkify('just plain text')).toEqual([
			{ link: false, value: 'just plain text', href: '' }
		]);
	});

	it('turns an http(s) URL into a link segment with the URL as its href', () => {
		const segs = linkify('see https://example.com/x now');
		expect(segs).toEqual([
			{ link: false, value: 'see ', href: '' },
			{ link: true, value: 'https://example.com/x', href: 'https://example.com/x' },
			{ link: false, value: ' now', href: '' }
		]);
	});

	it('gives a bare www. URL an https:// href', () => {
		const segs = linkify('go to www.example.org');
		expect(segs[1]).toEqual({
			link: true,
			value: 'www.example.org',
			href: 'https://www.example.org'
		});
	});

	it('trims trailing sentence punctuation off a matched URL', () => {
		const segs = linkify('open https://example.com.');
		expect(segs).toEqual([
			{ link: false, value: 'open ', href: '' },
			{ link: true, value: 'https://example.com', href: 'https://example.com' },
			{ link: false, value: '.', href: '' }
		]);
	});

	it('preserves newlines in surrounding text', () => {
		const segs = linkify('line one\nhttps://example.com');
		expect(segs[0]).toEqual({ link: false, value: 'line one\n', href: '' });
		expect(segs[1].link).toBe(true);
	});

	it('handles two URLs in one body', () => {
		const segs = linkify('https://a.test and https://b.test');
		expect(segs.filter((s) => s.link).map((s) => s.value)).toEqual([
			'https://a.test',
			'https://b.test'
		]);
	});
});

describe('personHue', () => {
	it('is deterministic for the same key', () => {
		expect(personHue('person-matt')).toBe(personHue('person-matt'));
	});

	it('always falls within 0–359', () => {
		for (const key of ['', 'a', 'person-matt', 'person-two', 'a much longer key value']) {
			const hue = personHue(key);
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThan(360);
		}
	});

	it('distinguishes the seed people from one another', () => {
		const hues = new Set(['person-matt', 'person-two', 'person-three'].map(personHue));
		expect(hues.size).toBe(3);
	});
});

describe('initial', () => {
	it('uppercases the first character of a name', () => {
		expect(initial('matt')).toBe('M');
		expect(initial('Person Two')).toBe('P');
	});

	it('ignores leading whitespace', () => {
		expect(initial('  alice')).toBe('A');
	});

	it('falls back to ? for a blank name', () => {
		expect(initial('')).toBe('?');
		expect(initial('   ')).toBe('?');
	});
});

// dayKey / dayLabel compare *local* calendar days. The fixtures below are
// built with the local-time Date constructor so the assertions hold in any
// timezone (an ISO 'Z' literal could straddle local midnight).
describe('dayKey', () => {
	it('is equal for two times on the same calendar day', () => {
		const morning = new Date(2026, 4, 17, 8, 0, 0).toISOString();
		const evening = new Date(2026, 4, 17, 20, 0, 0).toISOString();
		expect(dayKey(morning)).toBe(dayKey(evening));
	});

	it('differs across calendar days', () => {
		const day17 = new Date(2026, 4, 17, 12, 0, 0).toISOString();
		const day18 = new Date(2026, 4, 18, 12, 0, 0).toISOString();
		expect(dayKey(day17)).not.toBe(dayKey(day18));
	});
});

describe('dayLabel', () => {
	const now = new Date(2026, 4, 17, 12, 0, 0);

	it("labels the reference day 'Today'", () => {
		expect(dayLabel(new Date(2026, 4, 17, 8, 0, 0).toISOString(), now)).toBe('Today');
	});

	it("labels the prior day 'Yesterday'", () => {
		expect(dayLabel(new Date(2026, 4, 16, 20, 0, 0).toISOString(), now)).toBe('Yesterday');
	});

	it('labels an older day with a formatted date, not Today/Yesterday', () => {
		const label = dayLabel(new Date(2026, 4, 10, 12, 0, 0).toISOString(), now);
		expect(label).not.toBe('Today');
		expect(label).not.toBe('Yesterday');
		expect(label.length).toBeGreaterThan(0);
	});
});
