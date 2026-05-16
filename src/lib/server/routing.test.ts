import { describe, it, expect } from 'vitest';
import { parseConversationPrefix } from './routing';

describe('parseConversationPrefix', () => {
	it('extracts a #slug prefix and strips it from the body', () => {
		expect(parseConversationPrefix('#groceries need milk')).toEqual({
			slug: 'groceries',
			body: 'need milk'
		});
	});

	it('lowercases the slug', () => {
		expect(parseConversationPrefix('#Groceries eggs')).toEqual({
			slug: 'groceries',
			body: 'eggs'
		});
	});

	it('returns slug=null when there is no prefix', () => {
		expect(parseConversationPrefix('just a normal message')).toEqual({
			slug: null,
			body: 'just a normal message'
		});
	});

	it('does not treat a bare #word with no body as a route', () => {
		expect(parseConversationPrefix('#groceries')).toEqual({
			slug: null,
			body: '#groceries'
		});
	});

	it('leaves a # in the middle of a message alone', () => {
		expect(parseConversationPrefix('grab aisle #3 please')).toEqual({
			slug: null,
			body: 'grab aisle #3 please'
		});
	});

	it('accepts hyphenated slugs', () => {
		expect(parseConversationPrefix('#weekend-trip who is driving')).toEqual({
			slug: 'weekend-trip',
			body: 'who is driving'
		});
	});
});
