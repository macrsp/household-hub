import { describe, it, expect } from 'vitest';
import { mentionsClaude, parseGroceryItems } from './assistant';

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

describe('parseGroceryItems', () => {
	it('parses a bulleted grocery list', () => {
		expect(parseGroceryItems('- spaghetti\n- tomatoes\n- garlic')).toEqual([
			'spaghetti',
			'tomatoes',
			'garlic'
		]);
	});

	it('strips numbering and wrapping quotes', () => {
		expect(parseGroceryItems('1. "olive oil"\n2. parmesan')).toEqual([
			'olive oil',
			'parmesan'
		]);
	});

	it('drops a NONE reply and blank lines', () => {
		expect(parseGroceryItems('NONE')).toEqual([]);
		expect(parseGroceryItems('Here is the list:\n\n- eggs\n')).toEqual(['eggs']);
	});

	it('de-duplicates case-insensitively', () => {
		expect(parseGroceryItems('- Milk\n- milk\n- bread')).toEqual(['Milk', 'bread']);
	});

	it('caps the list', () => {
		const many = Array.from({ length: 30 }, (_, i) => `- item${i}`).join('\n');
		expect(parseGroceryItems(many)).toHaveLength(20);
	});
});
