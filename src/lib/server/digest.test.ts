import { describe, it, expect } from 'vitest';
import { formatDigestSections, digestSince, upcomingFacts } from './digest';

describe('formatDigestSections', () => {
	it('groups messages under a header per conversation', () => {
		const out = formatDigestSections([
			{ conversation_name: 'general', author_name: 'Matt', body: 'hi' },
			{ conversation_name: 'general', author_name: 'Sam', body: 'hey' },
			{ conversation_name: 'logistics', author_name: 'Matt', body: 'car booked' }
		]);
		expect(out).toBe('## general\nMatt: hi\nSam: hey\n\n## logistics\nMatt: car booked');
	});

	it('keeps interleaved messages under their own conversation', () => {
		const out = formatDigestSections([
			{ conversation_name: 'A', author_name: 'X', body: '1' },
			{ conversation_name: 'B', author_name: 'Y', body: '2' },
			{ conversation_name: 'A', author_name: 'X', body: '3' }
		]);
		expect(out).toBe('## A\nX: 1\nX: 3\n\n## B\nY: 2');
	});

	it('returns an empty string for no rows', () => {
		expect(formatDigestSections([])).toBe('');
	});
});

describe('digestSince', () => {
	it('subtracts the given hours from `now`', () => {
		const now = new Date('2026-05-18T12:00:00.000Z');
		expect(digestSince(24, now)).toBe('2026-05-17T12:00:00.000Z');
		expect(digestSince(1, now)).toBe('2026-05-18T11:00:00.000Z');
	});
});

describe('upcomingFacts', () => {
	const now = new Date('2026-05-19T12:00:00.000Z');
	const facts = (...dates: Array<string | null>) =>
		dates.map((valid_at) => ({ valid_at })) as unknown as Parameters<typeof upcomingFacts>[0];

	it('keeps facts from today through the next week', () => {
		expect(upcomingFacts(facts('2026-05-19', '2026-05-22', '2026-05-26'), now)).toHaveLength(3);
	});

	it('excludes past, far-future, and undated facts', () => {
		expect(upcomingFacts(facts('2026-05-10', '2026-06-30', null), now)).toHaveLength(0);
	});

	it('handles a date that carries a time', () => {
		expect(upcomingFacts(facts('2026-05-20 09:00'), now)).toHaveLength(1);
	});
});
