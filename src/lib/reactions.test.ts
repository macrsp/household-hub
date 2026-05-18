import { describe, it, expect } from 'vitest';
import { REACTION_EMOJI, isReactionEmoji } from './reactions';

// PLANS.md User-Asset Durability invariant 3: a unit test enumerates the
// declared set and asserts the validator accepts every entry, so adding or
// renaming a reaction emoji without updating the validator fails the build.
describe('reaction emoji set', () => {
	for (const emoji of REACTION_EMOJI) {
		it(`isReactionEmoji accepts the declared emoji '${emoji}'`, () => {
			expect(isReactionEmoji(emoji)).toBe(true);
		});
	}

	it('rejects an emoji outside the declared set', () => {
		expect(isReactionEmoji('🚀')).toBe(false);
	});

	it('rejects non-string values', () => {
		expect(isReactionEmoji(undefined)).toBe(false);
		expect(isReactionEmoji(42)).toBe(false);
		expect(isReactionEmoji(null)).toBe(false);
	});

	it('has no duplicate entries', () => {
		expect(new Set(REACTION_EMOJI).size).toBe(REACTION_EMOJI.length);
	});
});
