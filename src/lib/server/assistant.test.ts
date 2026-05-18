import { describe, it, expect } from 'vitest';
import { mentionsClaude } from './assistant';

describe('mentionsClaude', () => {
	it('detects an @claude mention', () => {
		expect(mentionsClaude('hey @claude what is the weather')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(mentionsClaude('@Claude help')).toBe(true);
		expect(mentionsClaude('@CLAUDE')).toBe(true);
	});

	it('matches at a word boundary, including trailing punctuation', () => {
		expect(mentionsClaude('@claude!')).toBe(true);
		expect(mentionsClaude('thanks, @claude.')).toBe(true);
	});

	it('does not match an @word that merely starts with claude', () => {
		expect(mentionsClaude('@claudette is here')).toBe(false);
	});

	it('does not match a message with no mention', () => {
		expect(mentionsClaude('just a normal message about claude shapes')).toBe(false);
		expect(mentionsClaude('')).toBe(false);
	});
});
